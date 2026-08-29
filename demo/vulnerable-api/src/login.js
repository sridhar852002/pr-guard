const users = [{ id: 1, username: 'alice', password: 'secret123' }];

/** Demo-only login — the PR branch makes this worse on purpose. */
function findUser(username) {
  return users.find((u) => u.username === username);
}

function login(username, password) {
  const user = findUser(username);
  if (!user || user.password !== password) {
    return { ok: false };
  }
  return { ok: true, token: `demo-${user.id}` };
}

module.exports = { login, findUser };
