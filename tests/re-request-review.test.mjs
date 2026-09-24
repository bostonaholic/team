import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL("../skills/pr-open-comments/scripts/re-request-review.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

// A missing or broken script must fail each test through an assertion, not abort the file.
const scriptModule = await import(scriptUrl.href).catch((error) => ({ loadError: error }));

const PULL_REQUEST_412 = { host: "github.com", owner: "o", repo: "r", number: 412 };
const PR_URL = "https://github.com/o/r/pull/412";
const BODY_SENTINEL = "BODY-SENTINEL-q9z4";
const FIXED_SUBMITTED_AT = "2026-09-20T12:00:00Z";

function derive(reviewState, pullRequest) {
  assert.equal(
    typeof scriptModule.deriveReRequest,
    "function",
    `re-request-review.mjs must export deriveReRequest (load error: ${scriptModule.loadError?.message ?? "none"})`,
  );
  return scriptModule.deriveReRequest(reviewState, pullRequest);
}

function user(login) {
  return { __typename: "User", login };
}

function bot(login) {
  return { __typename: "Bot", login };
}

function review({ author, state, url, body, inlineCommentCount }) {
  return { author, state, url, body, submittedAt: FIXED_SUBMITTED_AT, comments: { totalCount: inlineCommentCount } };
}

function thread({ isResolved, firstCommentUrl, latestAuthor, latestBody }) {
  return {
    isResolved,
    firstComment: { nodes: [{ url: firstCommentUrl }] },
    latestComment: { nodes: [{ author: latestAuthor, body: latestBody }] },
  };
}

function conversationComment({ author, url, body, reactionGroups = [] }) {
  return { author, url, body, reactionGroups };
}

function requestedUser(login) {
  return { requestedReviewer: { __typename: "User", login } };
}

function reviewState(fields) {
  return {
    viewerLogin: "me",
    reviewDecision: null,
    latestOpinionatedReviews: [],
    reviewRequests: [],
    reviewThreads: [],
    reviews: [],
    comments: [],
    ...fields,
  };
}

// alice requested changes through inline threads, so her review body is empty but not a
// clarification stop.
const ALICE_CHANGES_REQUESTED_WITH_THREADS = review({
  author: user("alice"),
  state: "CHANGES_REQUESTED",
  url: `${PR_URL}#pullrequestreview-100`,
  body: "",
  inlineCommentCount: 1,
});

const CAROL_CHANGES_REQUESTED_WITH_THREADS = review({
  author: user("carol"),
  state: "CHANGES_REQUESTED",
  url: `${PR_URL}#pullrequestreview-300`,
  body: "",
  inlineCommentCount: 2,
});

const BOB_APPROVED = review({
  author: user("bob"),
  state: "APPROVED",
  url: `${PR_URL}#pullrequestreview-200`,
  body: "",
  inlineCommentCount: 0,
});

function unresolvedReviewerThread(discussionId) {
  return thread({
    isResolved: false,
    firstCommentUrl: `${PR_URL}#discussion_r${discussionId}`,
    latestAuthor: { login: "alice" },
    latestBody: BODY_SENTINEL,
  });
}

// --- CLI harness: a fake `gh` on PATH -----------------------------------------------

const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const stateDir = process.env.FAKE_GH_STATE;
appendFileSync(join(stateDir, "calls.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
const counterPath = join(stateDir, "counter");
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
const responses = JSON.parse(readFileSync(join(stateDir, "responses.json"), "utf8"));
const response = responses[index];
if (response === undefined) {
  process.stderr.write("unexpected gh call\\n");
  process.exit(99);
}
process.stdout.write(response.stdout);
process.stderr.write(response.stderr);
process.exit(response.exitCode);
`;

function runScript(t, { url, responses }) {
  const binDir = mkdtempSync(join(tmpdir(), "rr-fake-gh-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "rr-fake-gh-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, url], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}`, FAKE_GH_STATE: stateDir },
  });

  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, lines, calls };
}

function connection(nodes, pageInfo = { hasNextPage: false, endCursor: null }) {
  return { nodes, pageInfo };
}

function pageOneResponse({
  viewerLogin = "me",
  reviewDecision = null,
  latestOpinionatedReviews = connection([]),
  reviewRequests = connection([]),
  reviewThreads = connection([]),
  reviews = connection([]),
  comments = connection([]),
}) {
  const data = {
    viewer: { login: viewerLogin },
    repository: {
      pullRequest: { reviewDecision, latestOpinionatedReviews, reviewRequests, reviewThreads, reviews, comments },
    },
  };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

function followUpPageResponse(connectionName, connectionPage) {
  const data = { repository: { pullRequest: { [connectionName]: connectionPage } } };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

function resolvedThread(discussionId) {
  return thread({
    isResolved: true,
    firstCommentUrl: `${PR_URL}#discussion_r${discussionId}`,
    latestAuthor: { login: "me" },
    latestBody: BODY_SENTINEL,
  });
}

function postReviewerRequest(login) {
  return ["api", "--method", "POST", "repos/o/r/pulls/412/requested_reviewers", "-f", `reviewers[]=${login}`];
}

const POST_SUCCEEDED = { stdout: JSON.stringify({ url: PR_URL }), stderr: "", exitCode: 0 };

// --- Targets, the review-decision gate, pending feedback, and the POST ---------------

test("derives targets and the review-decision gate", async (t) => {
  await t.test("a CHANGES_REQUESTED review makes its author the write target", () => {
    const result = derive(
      reviewState({
        reviewDecision: "CHANGES_REQUESTED",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("APPROVED and DISMISSED reviews are not targets", () => {
    const carolDismissed = review({
      author: user("carol"),
      state: "DISMISSED",
      url: `${PR_URL}#pullrequestreview-301`,
      body: "",
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [BOB_APPROVED, carolDismissed], reviews: [BOB_APPROVED, carolDismissed] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["not-requested no-changes-requested-reviewer"]);
  });

  await t.test("a reviewer with a pending review request prints already-requested and gets no write", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewRequests: [requestedUser("alice")],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["already-requested alice", "not-requested no-changes-requested-reviewer"]);
  });

  await t.test("the viewer's own CHANGES_REQUESTED review is dropped with no line", () => {
    const viewerChangesRequested = review({
      author: user("me"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-900`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [viewerChangesRequested, ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [viewerChangesRequested, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("a Bot author with a valid login prints skipped <login> not-a-user", () => {
    const botChangesRequested = review({
      author: bot("renovate"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-400`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [botChangesRequested], reviews: [botChangesRequested] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["skipped renovate not-a-user", "not-requested no-changes-requested-reviewer"]);
  });

  await t.test("an x[bot] login prints skipped invalid-login without the login", () => {
    const bracketBotChangesRequested = review({
      author: bot("x[bot]"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-401`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [bracketBotChangesRequested], reviews: [bracketBotChangesRequested] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["skipped invalid-login", "not-requested no-changes-requested-reviewer"]);
  });

  await t.test("a User login that fails the login pattern prints skipped invalid-login", () => {
    const leadingHyphenChangesRequested = review({
      author: user("-alice"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-402`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [leadingHyphenChangesRequested],
        reviews: [leadingHyphenChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["skipped invalid-login", "not-requested no-changes-requested-reviewer"]);
  });

  await t.test("a null review author prints skipped author-unavailable", () => {
    const ghostChangesRequested = review({
      author: null,
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-403`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [ghostChangesRequested], reviews: [ghostChangesRequested] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["skipped author-unavailable", "not-requested no-changes-requested-reviewer"]);
  });

  await t.test("reviewDecision APPROVED makes no write even with a changes-requesting reviewer", () => {
    const result = derive(
      reviewState({
        reviewDecision: "APPROVED",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["not-requested review-decision APPROVED"]);
  });

  await t.test("a null reviewDecision with a target still writes", () => {
    const result = derive(
      reviewState({
        reviewDecision: null,
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
  });

  await t.test("a PR with no reviews prints not-requested no-changes-requested-reviewer", () => {
    const result = derive(reviewState({}), PULL_REQUEST_412);
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["not-requested no-changes-requested-reviewer"]);
  });

  await t.test("two targets are written in login order", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [CAROL_CHANGES_REQUESTED_WITH_THREADS, ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [CAROL_CHANGES_REQUESTED_WITH_THREADS, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice", "carol"]);
  });
});

test("derives pending feedback without markers", async (t) => {
  await t.test("a resolved thread is not pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: true,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("an unresolved thread is pending and blocks the write", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
  });

  await t.test("an unresolved thread whose latest author is null is pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: null,
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
  });

  await t.test("a human review summary is pending", () => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#pullrequestreview-2001`, "not-requested pending-feedback"]);
  });

  await t.test("a human conversation comment is pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [conversationComment({ author: user("dave"), url: `${PR_URL}#issuecomment-3001`, body: BODY_SENTINEL })],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#issuecomment-3001`, "not-requested pending-feedback"]);
  });

  await t.test("a viewer reaction alone leaves a conversation comment pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({
            author: user("dave"),
            url: `${PR_URL}#issuecomment-3001`,
            body: BODY_SENTINEL,
            reactionGroups: [{ content: "THUMBS_UP", viewerHasReacted: true }],
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#issuecomment-3001`, "not-requested pending-feedback"]);
  });

  await t.test("a Bot conversation comment is ignored", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({ author: bot("graphite-app"), url: `${PR_URL}#issuecomment-3002`, body: BODY_SENTINEL }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("an empty CHANGES_REQUESTED review with no inline comments blocks every write", () => {
    const bobEmptyChangesRequested = review({
      author: user("bob"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-201`,
      body: "",
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["pending empty-changes-request bob", "not-requested pending-feedback"]);
  });

  await t.test("an empty CHANGES_REQUESTED review clears once its reviewer is in reviewRequests", () => {
    const bobEmptyChangesRequested = review({
      author: user("bob"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-201`,
      body: "",
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
        reviewRequests: [requestedUser("bob")],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, ["already-requested bob"]);
  });

  await t.test("eleven pending items print ten pending lines and pending-more 1", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          unresolvedReviewerThread(1001),
          unresolvedReviewerThread(1002),
          unresolvedReviewerThread(1003),
          unresolvedReviewerThread(1004),
          unresolvedReviewerThread(1005),
          unresolvedReviewerThread(1006),
          unresolvedReviewerThread(1007),
          unresolvedReviewerThread(1008),
          unresolvedReviewerThread(1009),
          unresolvedReviewerThread(1010),
          unresolvedReviewerThread(1011),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      `pending ${PR_URL}#discussion_r1002`,
      `pending ${PR_URL}#discussion_r1003`,
      `pending ${PR_URL}#discussion_r1004`,
      `pending ${PR_URL}#discussion_r1005`,
      `pending ${PR_URL}#discussion_r1006`,
      `pending ${PR_URL}#discussion_r1007`,
      `pending ${PR_URL}#discussion_r1008`,
      `pending ${PR_URL}#discussion_r1009`,
      `pending ${PR_URL}#discussion_r1010`,
      "pending-more 1",
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a pending item whose url names another PR prints pending url-unavailable", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: "https://github.com/o/r/pull/999#discussion_r1001",
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["pending url-unavailable", "not-requested pending-feedback"]);
  });
});

test("CLI writes only when nothing is pending", async (t) => {
  await t.test("a malformed PR URL exits 2 and runs no gh", (st) => {
    const run = runScript(st, { url: "https://github.com/o/r/pull/412;echo", responses: [] });
    assert.equal(run.status, 2);
    assert.deepEqual(run.calls, []);
  });

  await t.test("unparseable gh JSON prints review-state-read-failed and exits 1", (st) => {
    const run = runScript(st, { url: PR_URL, responses: [{ stdout: "not json", stderr: "", exitCode: 0 }] });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.status, 1);
  });

  await t.test("a connection with hasNextPage past the page cap prints review-state-incomplete and sends no POST", (st) => {
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([resolvedThread(1001)], { hasNextPage: true, endCursor: "threads-cursor-1" }),
        }),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1002)], { hasNextPage: true, endCursor: "threads-cursor-2" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1003)], { hasNextPage: true, endCursor: "threads-cursor-3" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1004)], { hasNextPage: true, endCursor: "threads-cursor-4" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1005)], { hasNextPage: true, endCursor: "threads-cursor-5" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1006)], { hasNextPage: true, endCursor: "threads-cursor-6" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1007)], { hasNextPage: true, endCursor: "threads-cursor-7" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1008)], { hasNextPage: true, endCursor: "threads-cursor-8" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1009)], { hasNextPage: true, endCursor: "threads-cursor-9" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1010)], { hasNextPage: true, endCursor: "threads-cursor-10" })),
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-incomplete"]);
    assert.equal(run.status, 1);
    assert.equal(run.calls.flat().includes("repos/o/r/pulls/412/requested_reviewers"), false, "no reviewer POST may run");
  });

  await t.test("a pending item sends no POST and exits 0", (st) => {
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([unresolvedReviewerThread(1001)]),
        }),
      ],
    });
    assert.deepEqual(run.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
    assert.equal(run.status, 0);
    assert.equal(run.calls.length, 1, "only the review-state read may run");
  });

  await t.test("a failed first POST prints failed <login> http-<status>, the second POST still runs, and exit is 1", (st) => {
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([CAROL_CHANGES_REQUESTED_WITH_THREADS, ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([CAROL_CHANGES_REQUESTED_WITH_THREADS, ALICE_CHANGES_REQUESTED_WITH_THREADS]),
        }),
        { stdout: "", stderr: "gh: Validation Failed (HTTP 422)\n", exitCode: 1 },
        POST_SUCCEEDED,
      ],
    });
    assert.deepEqual(run.lines, ["failed alice http-422", "re-requested carol"]);
    assert.deepEqual(run.calls.slice(1), [postReviewerRequest("alice"), postReviewerRequest("carol")]);
    assert.equal(run.status, 1);
  });

  await t.test("no stdout line carries a body byte", (st) => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary]),
          reviewThreads: connection([unresolvedReviewerThread(1001)]),
          comments: connection([
            conversationComment({ author: user("dave"), url: `${PR_URL}#issuecomment-3001`, body: BODY_SENTINEL }),
            conversationComment({ author: user("me"), url: `${PR_URL}#issuecomment-3002`, body: BODY_SENTINEL }),
          ]),
        }),
      ],
    });
    assert.deepEqual(run.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      `pending ${PR_URL}#pullrequestreview-2001`,
      `pending ${PR_URL}#issuecomment-3001`,
      "not-requested pending-feedback",
    ]);
    assert.doesNotMatch(run.stdout, new RegExp(BODY_SENTINEL));
  });
});

// --- Outcome markers -----------------------------------------------------------------

test("a viewer marker clears only the item it names", async (t) => {
  await t.test("a viewer-last thread with a marker for that thread is clear", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("a viewer-last thread with no marker is pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
  });

  await t.test("a viewer-last thread with a marker for another item is pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#discussion_r1002 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
  });

  await t.test("a viewer marker for issuecomment-123 leaves issuecomment-12 pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({ author: user("dave"), url: `${PR_URL}#issuecomment-12`, body: BODY_SENTINEL }),
          conversationComment({
            author: user("me"),
            url: `${PR_URL}#issuecomment-900`,
            body: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#issuecomment-123 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#issuecomment-12`, "not-requested pending-feedback"]);
  });

  await t.test("one viewer comment with two marker lines clears both items", () => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary],
        comments: [
          conversationComment({ author: user("dave"), url: `${PR_URL}#issuecomment-12`, body: BODY_SENTINEL }),
          conversationComment({
            author: user("me"),
            url: `${PR_URL}#issuecomment-900`,
            body: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->\n<!-- feedback-outcome: ${PR_URL}#pullrequestreview-2001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });
});

test("markers from other authors and later replies do not clear", async (t) => {
  await t.test("a marker in a non-viewer comment clears nothing", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({ author: user("dave"), url: `${PR_URL}#issuecomment-12`, body: BODY_SENTINEL }),
          conversationComment({
            author: user("mallory"),
            url: `${PR_URL}#issuecomment-13`,
            body: `<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#issuecomment-12`,
      `pending ${PR_URL}#issuecomment-13`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a reviewer reply after a marked viewer reply makes the thread pending again", () => {
    // Only the thread's latest comment is read, so the earlier marked viewer reply is not visible.
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"]);
  });
});

// --- Paginated reads -----------------------------------------------------------------

test("CLI follows a second page by cursor", (t) => {
  const run = runScript(t, {
    url: PR_URL,
    responses: [
      pageOneResponse({
        latestOpinionatedReviews: connection([BOB_APPROVED], { hasNextPage: true, endCursor: "opinionated-cursor-1" }),
        reviews: connection([BOB_APPROVED, ALICE_CHANGES_REQUESTED_WITH_THREADS]),
      }),
      followUpPageResponse(
        "latestOpinionatedReviews",
        connection([ALICE_CHANGES_REQUESTED_WITH_THREADS], { hasNextPage: false, endCursor: "opinionated-cursor-2" }),
      ),
      POST_SUCCEEDED,
    ],
  });
  assert.equal(run.calls[1]?.includes("after=opinionated-cursor-1"), true, "second gh call must carry after=<endCursor>");
  assert.deepEqual(run.lines, ["re-requested alice"]);
  assert.deepEqual(run.calls[2], postReviewerRequest("alice"));
  assert.equal(run.status, 0);
});

test("CLI stops at the page cap and on a failed page", async (t) => {
  await t.test("hasNextPage on page 10 prints review-state-incomplete after exactly 10 reads and sends no POST", (st) => {
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([resolvedThread(1001)], { hasNextPage: true, endCursor: "threads-cursor-1" }),
        }),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1002)], { hasNextPage: true, endCursor: "threads-cursor-2" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1003)], { hasNextPage: true, endCursor: "threads-cursor-3" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1004)], { hasNextPage: true, endCursor: "threads-cursor-4" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1005)], { hasNextPage: true, endCursor: "threads-cursor-5" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1006)], { hasNextPage: true, endCursor: "threads-cursor-6" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1007)], { hasNextPage: true, endCursor: "threads-cursor-7" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1008)], { hasNextPage: true, endCursor: "threads-cursor-8" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1009)], { hasNextPage: true, endCursor: "threads-cursor-9" })),
        followUpPageResponse("reviewThreads", connection([resolvedThread(1010)], { hasNextPage: true, endCursor: "threads-cursor-10" })),
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-incomplete"]);
    assert.equal(run.calls.length, 10, "page 1 plus 9 follow-up pages, then stop");
    assert.equal(run.status, 1);
  });

  await t.test("a failed second page prints review-state-read-failed and exits 1", (st) => {
    const run = runScript(st, {
      url: PR_URL,
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([resolvedThread(1001)], { hasNextPage: true, endCursor: "threads-cursor-1" }),
        }),
        { stdout: "", stderr: "gh: Bad Gateway (HTTP 502)\n", exitCode: 1 },
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.calls.length, 2, "no POST after a failed page");
    assert.equal(run.status, 1);
  });
});
