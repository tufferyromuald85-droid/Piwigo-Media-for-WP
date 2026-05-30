/**
 * PiwigoMedia — Gutenberg block inserter integration.
 *
 * Uses registerInserterMediaCategory() (WordPress 6.4+) to add Piwigo
 * as a media source in the block inserter panel, exactly like Openverse.
 *
 * Where it appears:
 *   Block editor → "+" button → Media tab → "Piwigo" category
 *   Block editor → Image block toolbar → Replace → Media tab → "Piwigo"
 */
( function () {
  'use strict';

  var DBG  = '[PiwigoMedia/gutenberg]';
  var cfg  = window.piwigoMediaConfig || {};
  var i18n = cfg.i18n || {};

  if ( ! wp || ! wp.data ) {
    console.warn( DBG, 'wp.data not available' );
    return;
  }

  var dispatch = wp.data.dispatch( 'core/block-editor' );

  if ( ! dispatch || typeof dispatch.registerInserterMediaCategory !== 'function' ) {
    console.warn( DBG, 'registerInserterMediaCategory not available (requires WP 6.4+)' );
    return;
  }

  dispatch.registerInserterMediaCategory( {
    name:      'piwigo-media/piwigo',
    labels: {
      name:         i18n.tabLabel   || 'Piwigo',
      search_items: i18n.searchItems || 'Search Piwigo',
    },
    mediaType: 'image',

    async fetch( query ) {
      query = query || {};
      try {
        var params = new URLSearchParams( {
          search:   query.search   || '',
          per_page: query.per_page || 20,
          page:     query.page     || 1,
        } );

        var photos = await wp.apiFetch( {
          path: '/piwigo-media/v1/inserter-photos?' + params.toString(),
        } );

        return ( photos || [] ).map( function ( photo ) {
          return {
            id:          undefined,   // undefined = external resource
            sourceId:    String( photo.id ),
            caption:     photo.title       || '',
            previewUrl:  photo.thumb_url   || photo.medium_url || '',
            url:         photo.medium_url  || photo.thumb_url  || '',
            alt:         photo.title       || '',
            description: photo.description || '',
          };
        } );
      } catch ( err ) {
        console.error( DBG, 'fetch error', err );
        return [];
      }
    },

    isExternalResource: true,
  } );

  console.log( DBG, 'registered successfully' );
} () );
