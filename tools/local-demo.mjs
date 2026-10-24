// Keep local-demo testing independent of edits to the saved plugin source URLs.
import {source as first} from '../plugins/wordpress.mjs';
import {source as second} from '../plugins/sahifa.mjs';
first.url='http://127.0.0.1:4180/';
second.url='http://127.0.0.1:4182/';
await import('../server.mjs');
