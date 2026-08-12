const GUEST_ID_KEY = 'hearts-by-duanap-guest-id';
const LEGACY_GUEST_ID_KEY = 'hearts-online-guest-id';

function randomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ensureGuestId() {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = localStorage.getItem(LEGACY_GUEST_ID_KEY);
    if (guestId) localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  if (!guestId) {
    guestId = `guest-${randomId()}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

export async function fetchIdentity() {
  const response = await fetch('/api/me', {
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error('身份信息加载失败');
  const data = await response.json();
  return {
    ...data,
    guestId: ensureGuestId()
  };
}

export async function authWithQq({ openId, accessToken }) {
  const response = await fetch('/api/auth/qq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      openId,
      accessToken,
      guestId: ensureGuestId()
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'QQ 登录失败');
  return {
    ...data,
    guestId: ensureGuestId()
  };
}

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin'
  });
  return fetchIdentity();
}

export async function fetchUserStats() {
  const response = await fetch(`/api/stats/me?guestId=${encodeURIComponent(ensureGuestId())}`, {
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error('个人战绩加载失败');
  return response.json();
}

export async function fetchLeaderboard(limit = 20) {
  const response = await fetch(`/api/leaderboard?limit=${encodeURIComponent(limit)}`, {
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error('排行榜加载失败');
  return response.json();
}

export async function fetchRecentMatches(limit = 20) {
  const response = await fetch(`/api/matches/recent?limit=${encodeURIComponent(limit)}`, {
    credentials: 'same-origin'
  });
  if (!response.ok) throw new Error('最近对局加载失败');
  return response.json();
}
