/**
 * PiwigoMedia — "Piwigo Photo" Gutenberg block.
 *
 * Appears in the block inserter under Media category.
 * Opens a wp.components.Modal with a full album browser (Albums → Photos → Insert).
 * On photo selection: imports via REST, then REPLACES itself with a standard core/image
 * block so the user ends up with a native WordPress image (compatible with everything).
 *
 * No build step required — uses wp.blocks, wp.element (React), wp.components globally.
 */
( function () {
  'use strict';

  if ( ! wp || ! wp.blocks || ! wp.element || ! wp.components || ! wp.apiFetch ) {
    return;
  }

  var el          = wp.element.createElement;
  var useState    = wp.element.useState;
  var useEffect   = wp.element.useEffect;
  var Fragment    = wp.element.Fragment;

  var registerBlockType = wp.blocks.registerBlockType;
  var createBlock       = wp.blocks.createBlock;
  var dispatch          = wp.data.dispatch;

  var Modal   = wp.components.Modal;
  var Button  = wp.components.Button;
  var Spinner = wp.components.Spinner;

  var apiFetch = wp.apiFetch;
  var cfg  = window.piwigoMediaConfig || {};
  var i18n = cfg.i18n || {};

  // ── AlbumGrid ─────────────────────────────────────────────────────────────
  function AlbumGrid( props ) {
    var onSelect = props.onSelect;
    var _s       = useState( { albums: [], loading: true, error: '' } );
    var state    = _s[0];
    var setState = _s[1];

    useEffect( function () {
      apiFetch( { path: '/piwigo-media/v1/albums' } )
        .then( function ( albums ) { setState( { albums: albums, loading: false, error: '' } ); } )
        .catch( function () { setState( { albums: [], loading: false, error: 'Could not load albums.' } ); } );
    }, [] );

    if ( state.loading ) return el( 'div', { className: 'piwigo-modal-loading' }, el( Spinner ) );
    if ( state.error )   return el( 'p', { className: 'piwigo-modal-error' }, state.error );
    if ( ! state.albums.length ) return el( 'p', { className: 'piwigo-modal-empty' }, i18n.noAlbums || 'No albums found.' );

    return el( 'ul', { className: 'piwigo-block-grid' },
      state.albums.map( function ( a ) {
        return el( 'li', {
          key:       a.id,
          className: 'piwigo-block-album',
          onClick:   function () { onSelect( a ); },
        },
          a.thumbnail_url
            ? el( 'img', { src: a.thumbnail_url, alt: a.name, loading: 'lazy' } )
            : el( 'span', { className: 'piwigo-no-thumb' } ),
          el( 'span', { className: 'piwigo-block-album-label' },
            a.name,
            el( 'small', null, ' (' + ( a.total_nb_images || 0 ) + ')' )
          )
        );
      } )
    );
  }

  // ── PhotoGrid ─────────────────────────────────────────────────────────────
  function PhotoGrid( props ) {
    var albumId   = props.albumId;
    var albumName = props.albumName;
    var onSelect  = props.onSelect;
    var onBack    = props.onBack;

    var _s    = useState( { photos: [], loading: true, error: '', page: 1, total: 0 } );
    var state = _s[0];
    var setState = _s[1];

    function loadPage( page ) {
      setState( function ( s ) { return Object.assign( {}, s, { loading: true } ); } );
      apiFetch( { path: '/piwigo-media/v1/albums/' + albumId + '/photos?per_page=24&page=' + page } )
        .then( function ( resp ) {
          setState( function ( s ) {
            return {
              photos:  page === 1 ? resp.photos : s.photos.concat( resp.photos ),
              loading: false,
              error:   '',
              page:    page,
              total:   resp.total || 0,
            };
          } );
        } )
        .catch( function () {
          setState( function ( s ) { return Object.assign( {}, s, { loading: false, error: 'Could not load photos.' } ); } );
        } );
    }

    useEffect( function () { loadPage( 1 ); }, [ albumId ] );

    return el( Fragment, null,
      el( 'div', { className: 'piwigo-block-breadcrumb' },
        el( Button, { variant: 'link', onClick: onBack }, '← Albums' ),
        el( 'span', null, ' / ', el( 'strong', null, albumName ) )
      ),
      state.error   && el( 'p', { className: 'piwigo-modal-error' }, state.error ),
      el( 'ul', { className: 'piwigo-block-grid piwigo-block-photos' },
        state.photos.map( function ( photo ) {
          return el( 'li', {
            key:       photo.id,
            className: 'piwigo-block-photo',
            onClick:   function () { onSelect( photo ); },
          },
            photo.thumb_url
              ? el( 'img', { src: photo.thumb_url, alt: photo.title, loading: 'lazy' } )
              : el( 'span', { className: 'piwigo-no-thumb' } ),
            photo.wp_attachment_id && el( 'span', { className: 'piwigo-already-imported' }, '✓' )
          );
        } )
      ),
      state.loading && el( 'div', { className: 'piwigo-modal-loading' }, el( Spinner ) ),
      ! state.loading && state.photos.length < state.total &&
        el( Button, { variant: 'secondary', onClick: function () { loadPage( state.page + 1 ); } },
          'Load more (' + ( state.total - state.photos.length ) + ' remaining)'
        )
    );
  }

  // ── PhotoDetail ───────────────────────────────────────────────────────────
  function PhotoDetail( props ) {
    var photoId   = props.photoId;
    var albumName = props.albumName;
    var onInsert  = props.onInsert;
    var onBack    = props.onBack;

    var _s    = useState( { photo: null, loading: true, inserting: false, mode: cfg.defaultMode || 'import', error: '' } );
    var state = _s[0];
    var setState = _s[1];

    useEffect( function () {
      apiFetch( { path: '/piwigo-media/v1/photos/' + photoId } )
        .then( function ( p ) { setState( function ( s ) { return Object.assign( {}, s, { photo: p, loading: false } ); } ); } )
        .catch( function () { setState( function ( s ) { return Object.assign( {}, s, { loading: false, error: 'Could not load photo.' } ); } ); } );
    }, [ photoId ] );

    function handleInsert() {
      setState( function ( s ) { return Object.assign( {}, s, { inserting: true, error: '' } ); } );
      apiFetch( {
        path:   '/piwigo-media/v1/import',
        method: 'POST',
        data:   { piwigo_photo_id: photoId, mode: state.mode },
      } )
        .then( function ( result ) {
          if ( result && result.attachment_id ) {
            onInsert( result.attachment_id, result.attachment_url, state.photo ? state.photo.title : '' );
          } else {
            setState( function ( s ) { return Object.assign( {}, s, { inserting: false, error: 'Unexpected response.' } ); } );
          }
        } )
        .catch( function ( err ) {
          var msg = err && err.message ? err.message : 'Import failed.';
          setState( function ( s ) { return Object.assign( {}, s, { inserting: false, error: msg } ); } );
        } );
    }

    if ( state.loading ) return el( 'div', { className: 'piwigo-modal-loading' }, el( Spinner ) );

    var photo = state.photo;

    return el( 'div', { className: 'piwigo-block-detail' },
      el( 'div', { className: 'piwigo-block-breadcrumb' },
        el( Button, { variant: 'link', onClick: onBack }, '← ' + albumName )
      ),
      el( 'div', { className: 'piwigo-block-detail-body' },
        el( 'div', { className: 'piwigo-block-detail-preview' },
          photo && ( photo.medium_url || photo.thumb_url )
            && el( 'img', { src: photo.medium_url || photo.thumb_url, alt: photo.title || '' } )
        ),
        el( 'div', { className: 'piwigo-block-detail-info' },
          photo && el( 'h3', null, photo.title || '' ),
          photo && photo.description && el( 'p', null, photo.description ),
          photo && photo.wp_attachment_id && el( 'p', { className: 'piwigo-already-badge' }, '✓ Already imported' ),
          el( 'div', { className: 'piwigo-block-mode-selector' },
            el( 'label', null,
              el( 'input', {
                type: 'radio', name: 'piwigo_block_mode', value: 'import',
                checked: state.mode === 'import',
                onChange: function () { setState( function ( s ) { return Object.assign( {}, s, { mode: 'import' } ); } ); },
              } ),
              ' Import to WP Media Library'
            ),
            el( 'label', null,
              el( 'input', {
                type: 'radio', name: 'piwigo_block_mode', value: 'link',
                checked: state.mode === 'link',
                onChange: function () { setState( function ( s ) { return Object.assign( {}, s, { mode: 'link' } ); } ); },
              } ),
              ' Link (Piwigo URL)'
            )
          ),
          state.error && el( 'p', { className: 'piwigo-modal-error' }, state.error ),
          el( Button, {
            variant:  'primary',
            onClick:  handleInsert,
            disabled: state.inserting,
            isBusy:   state.inserting,
          }, state.inserting ? 'Inserting…' : 'Insert into post' )
        )
      )
    );
  }

  // ── PiwigoBrowser (modal content) ─────────────────────────────────────────
  function PiwigoBrowser( props ) {
    var onInsert = props.onInsert;
    var onClose  = props.onClose;

    var _s    = useState( { view: 'albums', album: null, photo: null } );
    var state = _s[0];
    var setState = _s[1];

    var content;

    if ( state.view === 'albums' ) {
      content = el( AlbumGrid, {
        onSelect: function ( album ) {
          setState( { view: 'photos', album: album, photo: null } );
        },
      } );
    } else if ( state.view === 'photos' ) {
      content = el( PhotoGrid, {
        albumId:   state.album.id,
        albumName: state.album.name,
        onSelect:  function ( photo ) {
          setState( function ( s ) { return Object.assign( {}, s, { view: 'detail', photo: photo } ); } );
        },
        onBack: function () {
          setState( { view: 'albums', album: null, photo: null } );
        },
      } );
    } else {
      content = el( PhotoDetail, {
        photoId:   state.photo.id,
        albumName: state.album.name,
        onInsert:  onInsert,
        onBack:    function () {
          setState( function ( s ) { return Object.assign( {}, s, { view: 'photos', photo: null } ); } );
        },
      } );
    }

    return el( Modal, {
      title:              i18n.tabLabel || 'Piwigo',
      onRequestClose:     onClose,
      size:               'large',
      className:          'piwigo-block-modal',
      shouldCloseOnEsc:   true,
    }, content );
  }

  // ── Block edit component ──────────────────────────────────────────────────
  function PiwigoPhotoEdit( props ) {
    var clientId    = props.clientId;
    var attributes  = props.attributes || {};
    var _s          = useState( false );
    var isOpen      = _s[0];
    var setOpen     = _s[1];

    if ( attributes.preview ) {
      return el( 'div', { className: 'piwigo-block-placeholder piwigo-block-preview' },
        el( 'div', { className: 'piwigo-block-placeholder-inner' },
          el( 'img', {
            src:    ( cfg.pluginUrl || '' ) + 'assets/images/piwigo-black.svg',
            width:  48,
            height: 48,
            alt:    '',
            'aria-hidden': 'true',
            className: 'piwigo-block-logo',
          } ),
          el( 'p', null, i18n.tabLabel || 'Piwigo' ),
          el( 'div', { className: 'piwigo-block-preview-grid', 'aria-hidden': 'true' },
            [ 1, 2, 3, 4 ].map( function ( item ) {
              return el( 'span', { key: item, className: 'piwigo-block-preview-tile' } );
            } )
          )
        )
      );
    }

    function handleInsert( attachmentId, url, title ) {
      setOpen( false );

      // Replace this block with a standard core/image block
      var imageBlock = createBlock( 'core/image', {
        id:  attachmentId,
        url: url,
        alt: title,
      } );

      dispatch( 'core/block-editor' ).replaceBlock( clientId, imageBlock );
    }

    return el( 'div', { className: 'piwigo-block-placeholder' },
      el( 'div', { className: 'piwigo-block-placeholder-inner' },
        el( 'img', {
          src:    ( cfg.pluginUrl || '' ) + 'assets/images/piwigo-black.svg',
          width:  72,
          height: 72,
          alt:    '',
          'aria-hidden': 'true',
          className: 'piwigo-block-logo',
        } ),
        el( 'p', null, i18n.tabLabel || 'Piwigo' ),
        el( Button, {
          variant:   'primary',
          className: 'piwigo-browse-btn',
          onClick:   function () { setOpen( true ); },
        }, 'Browse Piwigo Gallery' )
      ),
      isOpen && el( PiwigoBrowser, { onInsert: handleInsert, onClose: function () { setOpen( false ); } } )
    );
  }

  // ── Register block ─────────────────────────────────────────────────────────
  var piwigoIcon = el( 'svg', {
    xmlns:       'http://www.w3.org/2000/svg',
    viewBox:     '0 0 24 24',
    fill:        'currentColor',
    role:        'img',
    'aria-hidden': 'true',
    focusable:   'false',
  },
    el( 'path', { d: 'M16.712 12.777A4.713 4.713 0 0112 17.49a4.713 4.713 0 01-4.713-4.713A4.713 4.713 0 0112 8.065a4.713 4.713 0 014.712 4.712zM19.112 0c-2.572.058-2.358 1.544-8.237 1.555h-4.15A5.947 5.947 0 00.777 7.502v10.55A5.947 5.947 0 006.725 24h10.55a5.947 5.947 0 005.948-5.947V4.08l-.008-.018c0-.014.004-.028.004-.043 0-2.227-1.88-4.02-4.108-4.02zm.09 2.545a1.409 1.409 0 011.407 1.41 1.409 1.409 0 01-1.408 1.408 1.409 1.409 0 01-1.41-1.408 1.409 1.409 0 011.41-1.41zM12 6.12a6.656 6.656 0 016.656 6.656A6.656 6.656 0 0112 19.434a6.656 6.656 0 01-6.656-6.657A6.656 6.656 0 0112 6.121z' } )
  );

  registerBlockType( 'piwigo-media/photo', {
    title:       i18n.tabLabel || 'Piwigo Photo',
    description: 'Browse and insert a photo from your Piwigo gallery.',
    category:    'media',
    icon:        { src: piwigoIcon, foreground: '#000000' },
    keywords:    [ 'piwigo', 'photo', 'gallery', 'image' ],
    apiVersion:  3,

    attributes: {
      // Runtime-only preview attribute used by the inserter preview.
      preview: { type: 'boolean', default: false },
    },

    example: {
      attributes: {
        preview: true,
      },
    },

    edit: PiwigoPhotoEdit,

    // Returns null: this block is ephemeral and immediately replaces itself
    // with core/image after the user selects a photo.
    save: function () { return null; },
  } );

  console.log( '[PiwigoMedia] block piwigo-media/photo registered' );
} () );
