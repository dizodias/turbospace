/** @deprecated Use cleaners/targets/windows-system.mjs + trash.mjs + browsers.mjs */
export {
  cleanThumbnails,
  cleanUpdateCache,
  cleanDeliveryOpt,
  cleanCrashDumpsWin as cleanCrashDumps,
  cleanShaderCache,
  measureWindowsExtras,
} from './targets/windows-system.mjs';
export { cleanRecycleBin } from './targets/trash.mjs';
export { cleanBrowserCache, measureBrowserCache } from './targets/browsers.mjs';
