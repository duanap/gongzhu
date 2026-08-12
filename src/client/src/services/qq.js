let sdkPromise = null;

function getQc() {
  return window.QC || null;
}

export function loadQqSdk({ appId, callbackUrl }) {
  if (getQc()) return Promise.resolve(getQc());
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.charset = 'utf-8';
    script.src = 'https://connect.qq.com/qc_jssdk.js';
    script.dataset.appid = appId;
    script.dataset.redirecturi = callbackUrl;
    script.onload = () => resolve(getQc());
    script.onerror = () => reject(new Error('Failed to load QQ SDK'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export async function readQqLogin(config) {
  const QC = await loadQqSdk(config);
  if (!QC?.Login?.check?.()) return null;
  return new Promise(resolve => {
    QC.Login.getMe((openId, accessToken) => {
      resolve({ openId, accessToken });
    });
  });
}

export async function showQqLogin(config) {
  const QC = await loadQqSdk(config);
  if (QC?.Login?.check?.()) return readQqLogin(config);
  QC.Login.showPopup({
    appId: config.appId,
    redirectURI: config.callbackUrl
  });
  return null;
}
