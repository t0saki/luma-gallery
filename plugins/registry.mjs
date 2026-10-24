// Register a site-specific ES module here. Each module exports source + parse.
import * as tosaki from './tosaki.mjs';
import * as wordpress from './wordpress.mjs';
import * as sahifa from './sahifa.mjs';
export const plugins=[tosaki,wordpress,sahifa];
