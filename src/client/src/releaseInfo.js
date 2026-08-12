import packageInfo from '../../../package.json';
import releaseInfo from '../../../release-info.json';

export const APP_VERSION = `v${packageInfo.version}`;
export const VERSION_LOGS = releaseInfo.logs;
