import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as cheerio from 'cheerio';
import {parseCatalogue,parseArticlePage,buildCatalogueURL,profile,parseTypes,parseNextPage} from '../plugins/wordpress.mjs';
import {photoFromNode} from '../lib/parser.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/4180-v2.json',import.meta.url),'utf8'));
const canonical='https://www.4khd.com';
function upstream(html){const $=cheerio.load(html);$('a[href],form[action]').each((i,e)=>{const node=$(e),attr=e.tagName==='form'?'action':'href',value=node.attr(attr);if(value?.startsWith('/')||value?.startsWith('http://127.0.0.1:4180/')){const url=new URL(value,'http://127.0.0.1:4180');if(!url.pathname.startsWith('/assets/'))node.attr(attr,canonical+url.pathname+url.search);}});return $;}
for(const base of ['https://wrtm.ssuu.uk/','https://www.4khd.com/','http://127.0.0.1:4180/']){
 test(`WordPress canonical links stay on active source ${base}`,()=>{
  const origin=new URL(base).origin,$=upstream(fixture['/']);
  const parsed=parseCatalogue({$,url:base,profile});
  assert.equal(parsed.albums.length,12);assert.ok(parsed.albums.every(a=>new URL(a.url).origin===origin));
  assert.deepEqual(parsed.categories.map(c=>c.url),['popular','cosplay','album'].map(slug=>origin+'/pages/'+slug));
  assert.equal(parsed.search.action,base);
  // This is the exact refresh request that failed after a prior discovery populated search.action.
  const source={url:base,search:{action:canonical+'/',parameter:'s'}};
  assert.equal(buildCatalogueURL(source,{query:'',category:''}),base);
  assert.equal(new URL(buildCatalogueURL(source,{query:'山间'})).origin,origin);
  for(const category of parsed.categories){assert.equal(buildCatalogueURL(source,{category:category.url,categories:parsed.categories}),category.url);}
  assert.equal(buildCatalogueURL(source,{category:canonical+'/pages/popular',categories:parsed.categories}),origin+'/pages/popular');
  assert.equal(parsed.nextPage,origin+'/?query-3-page=2');
  const detail=parseArticlePage({$:upstream(fixture['/content/24/album-001.html']),url:origin+'/content/24/album-001.html',photoFromNode,profile});
  assert.equal(detail.photos.length,2);assert.equal(detail.recommendations.length,9);
  assert.ok(detail.recommendations.every(a=>new URL(a.url).origin===origin));
  assert.equal(detail.nextPage,origin+'/content/24/album-001.html/2');
 });
}
test('empty catalogue ignores search action, while external search and undiscovered categories remain rejected',()=>{
 const source={url:'https://wrtm.ssuu.uk/',search:{action:'https://unrelated.example/',parameter:'s'}};
 assert.equal(buildCatalogueURL(source),source.url);
 assert.throws(()=>buildCatalogueURL(source,{query:'lake'}),e=>e.code==='INVALID_CATALOGUE_URL');
 assert.throws(()=>buildCatalogueURL(source,{category:canonical+'/pages/missing'}),e=>e.context.reason.includes('未从页面'));
 assert.throws(()=>buildCatalogueURL(source,{category:'https://unrelated.example/pages/popular',categories:[{url:'https://unrelated.example/pages/popular'}]}),e=>e.code==='INVALID_CATALOGUE_URL');
 for(const category of ['javascript:alert(1)','https://user:pass@www.4khd.com/pages/popular'])assert.throws(()=>buildCatalogueURL(source,{category}),e=>e.code==='INVALID_CATALOGUE_URL');
 const $=cheerio.load('<div class="topnav"><a href="#menu">menu</a><a href="https://evil.example/pages/x">outside</a><a href="https://www.4khd.com/pages/popular">normal</a></div>');
 assert.deepEqual(parseTypes($,source.url+'pages/album','.topnav a').map(c=>c.url),['https://wrtm.ssuu.uk/pages/popular']);
});
test('query-only pagination can read the current page from the request URL',()=>{
 const $=cheerio.load('<nav class="wp-block-query-pagination"><a href="?cst">1</a><a href="?query-3-page=2&cst">2</a><a href="?query-3-page=3&cst">3</a></nav>');
 assert.equal(parseNextPage($,'https://wrtm.ssuu.uk/pages/popular?query-3-page=2&cst'),'https://wrtm.ssuu.uk/pages/popular?query-3-page=3&cst');
});
