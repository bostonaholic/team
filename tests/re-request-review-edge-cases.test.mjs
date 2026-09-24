import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL("../skills/pr-open-comments/scripts/re-request-review.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

const scriptModule = await import(scriptUrl.href).catch((error) => ({ loadError: error }));

const PULL_REQUEST_412 = { host: "github.com", owner: "o", repo: "r", number: 412 };
const PR_URL = "https://github.com/o/r/pull/412";
const ENTERPRISE_PR_URL = "https://ghe.example.com/o/r/pull/412";
const BODY_SENTINEL = "BODY-SENTINEL-k3v8";

function derive(reviewState, pullRequest) {
  assert.equal(
    typeof scriptModule.deriveReRequest,
    "function",
    `re-request-review.mjs must export deriveReRequest (load error: ${scriptModule.loadError?.message ?? "none"})`,
  );
  return scriptModule.deriveReRequest(reviewState, pullRequest);
}

function changesRequested({ author, reviewId, body = "", inlineCommentCount = 1, prUrl = PR_URL }) {
  return {
    author,
    state: "CHANGES_REQUESTED",
    url: `${prUrl}#pullrequestreview-${reviewId}`,
    body,
    submittedAt: "2026-09-20T12:00:00Z",
    comments: { totalCount: inlineCommentCount },
  };
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

function viewerLastThread({ discussionId, latestBody }) {
  return {
    isResolved: false,
    firstComment: { nodes: [{ url: `${PR_URL}#discussion_r${discussionId}` }] },
    latestComment: { nodes: [{ author: { login: "me" }, body: latestBody }] },
  };
}

const ALICE_WITH_THREADS = changesRequested({ author: { __typename: "User", login: "alice" }, reviewId: 100 });

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

function runScript(t, { args, responses }) {
  const binDir = mkdtempSync(join(tmpdir(), "rr-edge-gh-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "rr-edge-gh-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH}`, FAKE_GH_STATE: stateDir },
  });

  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stdout: result.stdout, lines, calls };
}

function connection(nodes, pageInfo = { hasNextPage: false, endCursor: null }) {
  return { nodes, pageInfo };
}

function pageOneResponse({ latestOpinionatedReviews = connection([]), reviews = connection([]), reviewThreads = connection([]), comments = connection([]) }) {
  const data = {
    viewer: { login: "me" },
    repository: {
      pullRequest: {
        reviewDecision: null,
        latestOpinionatedReviews,
        reviewRequests: connection([]),
        reviewThreads,
        reviews,
        comments,
      },
    },
  };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

const ALICE_TARGET_PAGE = pageOneResponse({
  latestOpinionatedReviews: connection([ALICE_WITH_THREADS]),
  reviews: connection([ALICE_WITH_THREADS]),
});

const POST_SUCCEEDED = { stdout: "{}", stderr: "", exitCode: 0 };

test("CLI refuses a wrong argument count before any gh call", async (t) => {
  await t.test("no argument exits 2", (st) => {
    const run = runScript(st, { args: [], responses: [] });
    assert.equal(run.status, 2);
    assert.deepEqual(run.calls, []);
    assert.deepEqual(run.lines, []);
  });

  await t.test("two arguments exit 2", (st) => {
    const run = runScript(st, { args: [PR_URL, PR_URL], responses: [] });
    assert.equal(run.status, 2);
    assert.deepEqual(run.calls, []);
    assert.deepEqual(run.lines, []);
  });
});

test("CLI treats a failed or erroring first read as review-state-read-failed", async (t) => {
  await t.test("a non-zero gh exit on the first read", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [{ stdout: "", stderr: "gh: Bad credentials (HTTP 401)\n", exitCode: 1 }],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.calls.length, 1);
    assert.equal(run.status, 1);
  });

  await t.test("a GraphQL errors key with exit 0", (st) => {
    const page = JSON.parse(ALICE_TARGET_PAGE.stdout);
    const run = runScript(st, {
      args: [PR_URL],
      responses: [{ stdout: JSON.stringify({ ...page, errors: [{ type: "NOT_FOUND" }] }), stderr: "", exitCode: 0 }],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.calls.length, 1, "no POST after an erroring read");
    assert.equal(run.status, 1);
  });

  await t.test("a response with no pull request", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [{ stdout: JSON.stringify({ data: { viewer: { login: "me" }, repository: { pullRequest: null } } }), stderr: "", exitCode: 0 }],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.status, 1);
  });
});

test("CLI prints gh-exit-<n> when a failed POST names no HTTP status", (t) => {
  const run = runScript(t, {
    args: [PR_URL],
    responses: [ALICE_TARGET_PAGE, { stdout: "", stderr: "error connecting to api.github.com\n", exitCode: 4 }],
  });
  assert.deepEqual(run.lines, ["failed alice gh-exit-4"]);
  assert.equal(run.status, 1);
});

test("CLI passes --hostname for a non-github.com host", (t) => {
  const enterpriseAlice = changesRequested({
    author: { __typename: "User", login: "alice" },
    reviewId: 100,
    prUrl: ENTERPRISE_PR_URL,
  });
  const run = runScript(t, {
    args: [ENTERPRISE_PR_URL],
    responses: [
      pageOneResponse({ latestOpinionatedReviews: connection([enterpriseAlice]), reviews: connection([enterpriseAlice]) }),
      POST_SUCCEEDED,
    ],
  });
  assert.deepEqual(run.lines, ["re-requested alice"]);
  const [readCall, postCall] = run.calls;
  assert.equal(readCall[readCall.indexOf("--hostname") + 1], "ghe.example.com");
  assert.equal(readCall[readCall.indexOf("-F") + 1], "number=412");
  assert.deepEqual(postCall, [
    "api",
    "--hostname",
    "ghe.example.com",
    "--method",
    "POST",
    "repos/o/r/pulls/412/requested_reviewers",
    "-f",
    "reviewers[]=alice",
  ]);
  assert.equal(run.status, 0);
});

test("CLI sends no --hostname for github.com", (t) => {
  const run = runScript(t, { args: [PR_URL], responses: [ALICE_TARGET_PAGE, POST_SUCCEEDED] });
  assert.deepEqual(run.lines, ["re-requested alice"]);
  assert.equal(run.calls.flat().includes("--hostname"), false);
  assert.equal(run.status, 0);
});

test("an empty changes request from an author that cannot be re-requested does not block", async (t) => {
  await t.test("the viewer's own empty changes request", () => {
    const viewerEmpty = changesRequested({ author: { __typename: "User", login: "me" }, reviewId: 900, inlineCommentCount: 0 });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [viewerEmpty, ALICE_WITH_THREADS], reviews: [viewerEmpty, ALICE_WITH_THREADS] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: [], logins: ["alice"] });
  });

  await t.test("a Bot author's empty changes request", () => {
    const botEmpty = changesRequested({ author: { __typename: "Bot", login: "renovate" }, reviewId: 901, inlineCommentCount: 0 });
    const result = derive(
      reviewState({ latestOpinionatedReviews: [botEmpty, ALICE_WITH_THREADS], reviews: [botEmpty, ALICE_WITH_THREADS] }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: ["skipped renovate not-a-user"], logins: ["alice"] });
  });
});

test("a non-empty changes-request body is pending until answered", () => {
  const aliceWithBody = changesRequested({ author: { __typename: "User", login: "alice" }, reviewId: 100, body: BODY_SENTINEL, inlineCommentCount: 0 });
  const result = derive(
    reviewState({ latestOpinionatedReviews: [aliceWithBody], reviews: [aliceWithBody] }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result, { lines: [`pending ${PR_URL}#pullrequestreview-100`, "not-requested pending-feedback"], logins: [] });
});

test("more than ten pending urls list the empty changes requests after pending-more", () => {
  const bobEmpty = changesRequested({ author: { __typename: "User", login: "bob" }, reviewId: 200, inlineCommentCount: 0 });
  const unresolvedThreads = Array.from({ length: 11 }, (_, index) => ({
    isResolved: false,
    firstComment: { nodes: [{ url: `${PR_URL}#discussion_r${2000 + index}` }] },
    latestComment: { nodes: [{ author: { login: "alice" }, body: BODY_SENTINEL }] },
  }));
  const result = derive(
    reviewState({
      latestOpinionatedReviews: [ALICE_WITH_THREADS, bobEmpty],
      reviews: [ALICE_WITH_THREADS, bobEmpty],
      reviewThreads: unresolvedThreads,
    }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result.logins, []);
  assert.deepEqual(result.lines.slice(-3), ["pending-more 1", "pending empty-changes-request bob", "not-requested pending-feedback"]);
  assert.equal(result.lines.filter((line) => line.startsWith(`pending ${PR_URL}`)).length, 10);
});

test("an outcome marker counts only as a whole line", async (t) => {
  await t.test("a marker line ending in CRLF clears its thread", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_WITH_THREADS],
        reviews: [ALICE_WITH_THREADS],
        reviewThreads: [
          viewerLastThread({
            discussionId: 1001,
            latestBody: `${BODY_SENTINEL}\r\n<!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->\r\n`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: [], logins: ["alice"] });
  });

  await t.test("a marker inside a line of prose clears nothing", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_WITH_THREADS],
        reviews: [ALICE_WITH_THREADS],
        reviewThreads: [
          viewerLastThread({
            discussionId: 1001,
            latestBody: `Fixed. <!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, {
      lines: [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"],
      logins: [],
    });
  });
});

test("a marker in a viewer review body does not clear a PR-level item", () => {
  const daveComment = { url: `${PR_URL}#issuecomment-12`, body: BODY_SENTINEL, author: { __typename: "User", login: "dave" } };
  const viewerReview = {
    state: "COMMENTED",
    url: `${PR_URL}#pullrequestreview-300`,
    body: `<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->`,
    comments: { totalCount: 0 },
    author: { __typename: "User", login: "me" },
  };
  const result = derive(
    reviewState({
      latestOpinionatedReviews: [ALICE_WITH_THREADS],
      reviews: [ALICE_WITH_THREADS, viewerReview],
      comments: [daveComment],
    }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result, {
    lines: [`pending ${PR_URL}#issuecomment-12`, "not-requested pending-feedback"],
    logins: [],
  });
});
