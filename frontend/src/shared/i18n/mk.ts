/**
 * Macedonian translations, keyed by the English text in the source. Split by area (mk/*.ts); later areas win on a
 * clash. Find untranslated keys with the check in docs/i18n.md.
 */
import { APP } from "./mk/app";
import { CROPDOCTOR } from "./mk/cropdoctor";
import { CROPTWIN } from "./mk/croptwin";
import { EXTRA } from "./mk/extra";
import { SHARED } from "./mk/shared";
import { SIMULATOR } from "./mk/simulator";

export const MK: Record<string, string> = { ...SHARED, ...APP, ...CROPTWIN, ...CROPDOCTOR, ...SIMULATOR, ...EXTRA };
