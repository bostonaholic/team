# Authorized watch mode

Load only when the arming instruction explicitly authorizes handling all
feedback.

For each newly detected batch, call `pr-open-comments` in its explicit batch
authorization mode. Verification and safety stops remain mandatory even
though confidence no longer gates execution.

Apply, test, selectively stage, commit, push, reply, and resolve each allowable
item. Then resume polling. Stop after finishing allowable items when any item:

- is security-sensitive;
- expands scope beyond the review anchor;
- asks for clarification or cannot be applied;
- was explicitly declined; or
- cannot be pushed.

Report partial writes before stopping. A safety-stop re-arm returns to default
mode unless the new instruction repeats authorization.
