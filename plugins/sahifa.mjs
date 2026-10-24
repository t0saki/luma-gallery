import {parseCatalogue} from './wordpress.mjs';
export const source={id:'shijing',name:'拾景相册 · 4182',adapter:'sahifa-gallery',mode:'static',streaming:true};
export const profile={typeSelector:'#main-nav .main-menu > ul > li:not(.menu-item-home) > a[href], .post-cats a[rel~="tag"]',articleTypeSelector:'.post-cats a[rel~="tag"]',cards:'.post-listing.archive-box > article.item-list',title:'h2.post-box-title a',cover:'.post-thumbnail img',body:'.entry',heading:'h1.name.post-title.entry-title',pagination:'.page-link',listPagination:'.pagination',recommendations:'.yarpp-related',photo:'p > img.aligncenter, p > a > img.aligncenter'};
export function parse(input){return parseCatalogue({...input,profile}).albums;}
