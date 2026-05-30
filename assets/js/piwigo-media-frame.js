/**
 * PiwigoMedia — custom tab in the WordPress media modal.
 *
 * The tab appears in the standard "Add Media" modal (Classic Editor) and
 * in the "Media Library" modal triggered by Gutenberg image blocks.
 *
 * Where to find it:
 *   Classic Editor  → "Add Media" button → "Piwigo" tab (top navigation)
 *   Gutenberg       → Image block → "Media Library" → "Piwigo" tab
 */
(function ($, wp) {
  'use strict';

  if (!wp || !wp.media || !wp.media.view || !wp.media.view.MediaFrame) {
    return;
  }

  var cfg   = window.piwigoMediaConfig || {};
  var i18n  = cfg.i18n    || {};
  var api   = cfg.apiBase || '';
  var nonce = cfg.nonce   || '';

  // ── API fetch helper ──────────────────────────────────────────────────────
  function piwigoFetch(path, opts) {
    return $.ajax($.extend({
      url:        api + path,
      type:       'GET',
      beforeSend: function (xhr) { xhr.setRequestHeader('X-WP-Nonce', nonce); },
      dataType:   'json',
    }, opts || {}));
  }

  // ── State ─────────────────────────────────────────────────────────────────
  // router:'browse' → frame shows the tab bar and calls browseRouter()
  // content:'browse' → frame calls browseContent() to render our view
  var PiwigoBrowserState = wp.media.controller.State.extend({
    defaults: {
      id:         'piwigo-browser',
      title:      i18n.tabLabel || 'Piwigo',
      router:     'browse',
      content:    'browse',
      toolbar:    false,
      menu:       'default',
      filterable: false,
      searchable: false,
      multiple:   false,
    },
  });

  // ── Albums view ───────────────────────────────────────────────────────────
  var AlbumsView = wp.Backbone.View.extend({
    className: 'piwigo-albums-view',
    events: { 'click .piwigo-album-item': 'selectAlbum' },

    initialize: function () { this.render(); this.load(); },

    load: function () {
      var self = this;
      self.$el.html('<p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p>');

      piwigoFetch('/albums').done(function (albums) {
        if (!albums || !albums.length) {
          self.$el.html('<p class="piwigo-empty">' + (i18n.noAlbums || 'No albums found.') + '</p>');
          return;
        }
        var html = '<ul class="piwigo-grid">';
        albums.forEach(function (a) {
          var thumb = a.thumbnail_url ? '<img src="' + _.escape(a.thumbnail_url) + '" alt="" loading="lazy">'
                                      : '<span class="piwigo-no-thumb"></span>';
          html += '<li class="piwigo-album-item" data-id="' + a.id + '" data-name="' + _.escape(a.name) + '">'
            + thumb
            + '<span class="piwigo-album-label">' + _.escape(a.name)
            + ' <small>(' + (a.total_nb_images || 0) + ')</small></span></li>';
        });
        html += '</ul>';
        self.$el.html(html);
      }).fail(function () {
        self.$el.html('<p class="piwigo-error">' + (i18n.error || 'Error') + ': could not load albums.</p>');
      });
    },

    selectAlbum: function (e) {
      var $item = $(e.currentTarget);
      this.trigger('album:select', $item.data('id'), $item.data('name'));
    },
  });

  // ── Photos view ───────────────────────────────────────────────────────────
  var PhotosView = wp.Backbone.View.extend({
    className: 'piwigo-photos-view',
    events: {
      'click .piwigo-photo-item': 'selectPhoto',
      'click .piwigo-back':       'goBack',
      'click .piwigo-load-more':  'loadMore',
    },

    initialize: function (opts) {
      this.albumId   = opts.albumId;
      this.albumName = opts.albumName;
      this.page      = 1;
      this.perPage   = 24;
      this.total     = 0;
      this.photos    = [];
      this.render();
      this.load();
    },

    render: function () {
      this.$el.html(
        '<div class="piwigo-breadcrumb">'
        + '<button class="piwigo-back button">← Albums</button>'
        + ' / <strong>' + _.escape(this.albumName) + '</strong>'
        + '</div>'
        + '<ul class="piwigo-grid piwigo-photos-grid"></ul>'
        + '<p class="piwigo-loading piwigo-photos-loading" style="display:none">' + (i18n.loading || 'Loading…') + '</p>'
        + '<button class="piwigo-load-more button" style="display:none">Load more</button>'
      );
      return this;
    },

    load: function () {
      var self = this;
      self.$('.piwigo-photos-loading').show();

      piwigoFetch('/albums/' + self.albumId + '/photos', {
        data: { page: self.page, per_page: self.perPage },
      }).done(function (resp) {
        self.$('.piwigo-photos-loading').hide();
        self.total = resp.total || 0;

        if (!resp.photos || !resp.photos.length) {
          if (self.page === 1) {
            self.$('.piwigo-photos-grid').html('<li class="piwigo-empty-item">' + (i18n.noPhotos || 'No photos.') + '</li>');
          }
          return;
        }

        resp.photos.forEach(function (photo) {
          self.photos.push(photo);
          var badge = photo.wp_attachment_id
            ? '<span class="piwigo-already-imported">' + (i18n.alreadyImported || '✓') + '</span>' : '';
          var thumb = photo.thumb_url
            ? '<img src="' + _.escape(photo.thumb_url) + '" alt="" loading="lazy">' : '<span class="piwigo-no-thumb"></span>';
          self.$('.piwigo-photos-grid').append(
            '<li class="piwigo-photo-item" data-id="' + photo.id + '">' + thumb + badge + '</li>'
          );
        });

        var loaded = self.photos.length;
        if (loaded < self.total) {
          self.$('.piwigo-load-more').show().text('Load more (' + (self.total - loaded) + ' remaining)');
        } else {
          self.$('.piwigo-load-more').hide();
        }
      }).fail(function () {
        self.$('.piwigo-photos-loading').hide();
        self.$('.piwigo-photos-grid').append('<li class="piwigo-error-item">' + (i18n.error || 'Error') + '</li>');
      });
    },

    loadMore:    function () { this.page++; this.load(); },
    goBack:      function () { this.trigger('back'); },
    selectPhoto: function (e) {
      var $item = $(e.currentTarget).addClass('piwigo-selected');
      $('.piwigo-photo-item').not($item).removeClass('piwigo-selected');
      var id = $item.data('id');
      this.trigger('photo:select', this.photos.find(function (p) { return p.id === id; }) || { id: id });
    },
  });

  // ── Detail view ───────────────────────────────────────────────────────────
  var PhotoDetailView = wp.Backbone.View.extend({
    className: 'piwigo-detail-view',
    events: {
      'click .piwigo-insert': 'insert',
      'click .piwigo-back':   'goBack',
      'change .piwigo-mode':  'changeMode',
    },

    initialize: function (opts) {
      this.photo     = opts.photo;
      this.albumName = opts.albumName;
      this.mode      = cfg.defaultMode || 'import';
      this.loading   = false;
      this.render();
      this.loadDetail();
    },

    render: function () {
      this.$el.html(
        '<div class="piwigo-breadcrumb">'
        + '<button class="piwigo-back button">← ' + _.escape(this.albumName) + '</button>'
        + '</div>'
        + '<div class="piwigo-detail-body">'
        +   '<div class="piwigo-detail-preview"><p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p></div>'
        +   '<div class="piwigo-detail-info">'
        +     '<h3 class="piwigo-detail-title"></h3>'
        +     '<p class="piwigo-detail-desc"></p>'
        +     '<div class="piwigo-mode-selector">'
        +       '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="import" '
        +         (this.mode === 'import' ? 'checked' : '') + '> Import to WP Media Library</label>'
        +       '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="link" '
        +         (this.mode === 'link' ? 'checked' : '') + '> Link (Piwigo URL)</label>'
        +     '</div>'
        +     '<div class="piwigo-detail-status"></div>'
        +     '<button class="piwigo-insert button button-primary">Insert into post</button>'
        +   '</div>'
        + '</div>'
      );
      return this;
    },

    loadDetail: function () {
      var self = this;
      piwigoFetch('/photos/' + self.photo.id).done(function (photo) {
        self.fullPhoto = photo;
        var src = photo.medium_url || photo.thumb_url || '';
        self.$('.piwigo-detail-preview').html(src ? '<img src="' + _.escape(src) + '" alt="">' : '');
        self.$('.piwigo-detail-title').text(photo.title || '');
        self.$('.piwigo-detail-desc').text(photo.description || '');
        if (photo.wp_attachment_id) {
          self.$('.piwigo-detail-status').html('<span class="piwigo-already-badge">' + (i18n.alreadyImported || '✓ Already imported') + '</span>');
        }
      }).fail(function () {
        self.$('.piwigo-detail-preview').html('<p class="piwigo-error">Could not load photo details.</p>');
      });
    },

    changeMode: function (e) { this.mode = e.target.value; },
    goBack:     function ()  { this.trigger('back'); },

    insert: function () {
      var self = this;
      if (self.loading) return;
      self.loading = true;
      self.$('.piwigo-insert').prop('disabled', true).text('Inserting…');
      self.$('.piwigo-detail-status').text('');

      piwigoFetch('/import', {
        type:        'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ piwigo_photo_id: self.photo.id, mode: self.mode }),
      }).done(function (result) {
        self.loading = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');

        if (result && result.attachment_id) {
          self.trigger('photo:inserted', result.attachment_id);
        } else {
          self.$('.piwigo-detail-status').text('Error: unexpected response.');
        }
      }).fail(function (xhr) {
        self.loading = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');
        var msg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Request failed.';
        self.$('.piwigo-detail-status').text((i18n.error || 'Error: ') + msg);
      });
    },
  });

  // ── Main browser content (navigation controller) ──────────────────────────
  var PiwigoBrowserContent = wp.media.View.extend({
    className: 'piwigo-browser-content attachments-browser',

    initialize: function () {
      this.currentView = null;
      this.showAlbums();
    },

    showAlbums: function () {
      var view = new AlbumsView();
      this.listenTo(view, 'album:select', this.showPhotos.bind(this));
      this.swap(view);
    },

    showPhotos: function (albumId, albumName) {
      var view = new PhotosView({ albumId: albumId, albumName: albumName });
      this.listenTo(view, 'back',         this.showAlbums.bind(this));
      this.listenTo(view, 'photo:select', this.showDetail.bind(this, albumName));
      this.swap(view);
    },

    showDetail: function (albumName, photo) {
      var view = new PhotoDetailView({ photo: photo, albumName: albumName });
      this.listenTo(view, 'back',           this.showAlbums.bind(this));
      this.listenTo(view, 'photo:inserted', this.onInserted.bind(this));
      this.swap(view);
    },

    onInserted: function (attachmentId) {
      var frame      = this.controller;
      var attachment = wp.media.attachment(attachmentId);

      attachment.fetch().done(function () {
        var selection = frame.state('library') && frame.state('library').get('selection');
        if (selection) {
          selection.reset([attachment]);
        }
        frame.close();
        // Trigger the native select event so editors receive the attachment
        frame.trigger('select');
      });
    },

    swap: function (view) {
      if (this.currentView) { this.stopListening(this.currentView); this.currentView.remove(); }
      this.currentView = view;
      this.$el.empty().append(view.el);
      view.delegateEvents();
    },

    render: function () { return this; },
  });

  // ── Extend MediaFrame.Post ────────────────────────────────────────────────
  // MediaFrame.Post is the frame opened by "Add Media" in the Classic Editor
  // and by the Gutenberg "Media Library" button.
  var OrigPost = wp.media.view.MediaFrame.Post;

  wp.media.view.MediaFrame.Post = OrigPost.extend({

    initialize: function () {
      OrigPost.prototype.initialize.apply(this, arguments);
      this.states.add(new PiwigoBrowserState());
    },

    // browseRouter sets up the tab navigation (called when router='browse')
    browseRouter: function (routerView) {
      OrigPost.prototype.browseRouter.apply(this, arguments);
      routerView.set({
        'piwigo-browser': {
          text:     i18n.tabLabel || 'Piwigo',
          priority: 200,
        },
      });
    },

    // browseContent renders content (called when content='browse' and state changes)
    browseContent: function (content) {
      if (this.state().id === 'piwigo-browser') {
        this.$el.removeClass('hide-toolbar');
        content.view = new PiwigoBrowserContent({ controller: this });
      } else {
        OrigPost.prototype.browseContent.apply(this, arguments);
      }
    },
  });

  // ── Also extend MediaFrame.Select for Gutenberg block editor ─────────────
  // Gutenberg's Image/Gallery blocks sometimes open a Select frame directly.
  var OrigSelect = wp.media.view.MediaFrame.Select;

  wp.media.view.MediaFrame.Select = OrigSelect.extend({
    initialize: function () {
      OrigSelect.prototype.initialize.apply(this, arguments);
      this.states.add(new PiwigoBrowserState());
    },
  });

}(jQuery, wp));
