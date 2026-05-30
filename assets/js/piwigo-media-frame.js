/**
 * PiwigoMedia — custom wp.media tab
 * Adds a "Piwigo" tab to the native WP media modal with album/photo browser.
 */
(function ($, wp) {
  'use strict';

  if (!wp || !wp.media) return;

  var cfg   = window.piwigoMediaConfig || {};
  var api   = cfg.apiBase  || '/wp-json/piwigo-media/v1';
  var nonce = cfg.nonce    || '';
  var i18n  = cfg.i18n    || {};

  // ── API fetch helper ──────────────────────────────────────────────────────
  function apiFetch(path, opts) {
    opts = opts || {};
    return $.ajax($.extend({
      url: api + path,
      type: 'GET',
      beforeSend: function (xhr) {
        xhr.setRequestHeader('X-WP-Nonce', nonce);
      },
      dataType: 'json',
    }, opts));
  }

  // ── State: Piwigo browser ─────────────────────────────────────────────────
  var PiwigoBrowserState = wp.media.controller.State.extend({
    defaults: {
      id:      'piwigo-browser',
      title:   i18n.tabLabel || 'Piwigo',
      menu:    'default',
      toolbar: 'piwigo-select',
      router:  false,
      content: 'piwigo-browser',
    },
  });

  // ── View: albums grid ─────────────────────────────────────────────────────
  var AlbumsView = wp.Backbone.View.extend({
    className: 'piwigo-albums-view',
    events: {
      'click .piwigo-album-item': 'selectAlbum',
    },

    initialize: function () {
      this.render();
      this.loadAlbums();
    },

    loadAlbums: function () {
      var self = this;
      self.$el.html('<p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p>');

      apiFetch('/albums').done(function (albums) {
        if (!albums || !albums.length) {
          self.$el.html('<p class="piwigo-empty">' + (i18n.noAlbums || 'No albums found.') + '</p>');
          return;
        }
        var html = '<ul class="piwigo-grid">';
        albums.forEach(function (album) {
          var thumb = album.thumbnail_url
            ? '<img src="' + album.thumbnail_url + '" alt="">'
            : '<span class="piwigo-no-thumb"></span>';
          html += '<li class="piwigo-album-item" data-id="' + album.id + '" data-name="' + _.escape(album.name) + '">'
            + thumb
            + '<span class="piwigo-album-label">' + _.escape(album.name)
            + ' <small>(' + album.total_nb_images + ')</small></span>'
            + '</li>';
        });
        html += '</ul>';
        self.$el.html(html);
      }).fail(function () {
        self.$el.html('<p class="piwigo-error">' + (i18n.error || 'Error: ') + 'Could not load albums.</p>');
      });
    },

    selectAlbum: function (e) {
      var $item  = $(e.currentTarget);
      var id     = $item.data('id');
      var name   = $item.data('name');
      this.trigger('album:select', id, name);
    },
  });

  // ── View: photos grid ─────────────────────────────────────────────────────
  var PhotosView = wp.Backbone.View.extend({
    className: 'piwigo-photos-view',
    events: {
      'click .piwigo-photo-item':  'selectPhoto',
      'click .piwigo-back':        'goBack',
      'click .piwigo-load-more':   'loadMore',
    },

    initialize: function (opts) {
      this.albumId   = opts.albumId;
      this.albumName = opts.albumName;
      this.page      = 1;
      this.perPage   = 24;
      this.total     = 0;
      this.photos    = [];
      this.selected  = null;
      this.render();
      this.loadPhotos();
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

    loadPhotos: function () {
      var self = this;
      self.$('.piwigo-photos-loading').show();

      apiFetch('/albums/' + self.albumId + '/photos', {
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
          var alreadyMark = photo.wp_attachment_id
            ? '<span class="piwigo-already-imported">' + (i18n.alreadyImported || '✓ imported') + '</span>'
            : '';
          var thumb = photo.thumb_url
            ? '<img src="' + photo.thumb_url + '" alt="' + _.escape(photo.title) + '" loading="lazy">'
            : '<span class="piwigo-no-thumb"></span>';
          self.$('.piwigo-photos-grid').append(
            '<li class="piwigo-photo-item" data-id="' + photo.id + '">'
            + thumb + alreadyMark + '</li>'
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

    loadMore: function () {
      this.page++;
      this.loadPhotos();
    },

    selectPhoto: function (e) {
      var $item = $(e.currentTarget);
      $('.piwigo-photo-item').removeClass('piwigo-selected');
      $item.addClass('piwigo-selected');
      var id    = $item.data('id');
      this.selected = this.photos.find(function (p) { return p.id === id; }) || { id: id };
      this.trigger('photo:select', this.selected);
    },

    goBack: function () {
      this.trigger('back');
    },
  });

  // ── View: detail / insert panel ───────────────────────────────────────────
  var PhotoDetailView = wp.Backbone.View.extend({
    className: 'piwigo-detail-view',
    events: {
      'click .piwigo-insert': 'insertPhoto',
      'click .piwigo-back':   'goBack',
      'change .piwigo-mode':  'changeMode',
    },

    initialize: function (opts) {
      this.photo    = opts.photo;
      this.albumId  = opts.albumId;
      this.albumName= opts.albumName;
      this.mode     = cfg.defaultMode || 'import';
      this.loading  = false;
      this.render();
      this.loadDetail();
    },

    render: function () {
      var p = this.photo;
      this.$el.html(
        '<div class="piwigo-breadcrumb">'
        + '<button class="piwigo-back button">← ' + _.escape(this.albumName) + '</button>'
        + '</div>'
        + '<div class="piwigo-detail-body">'
        + '<div class="piwigo-detail-preview"><p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p></div>'
        + '<div class="piwigo-detail-info">'
        + '<h3 class="piwigo-detail-title"></h3>'
        + '<p class="piwigo-detail-desc"></p>'
        + '<div class="piwigo-mode-selector">'
        + '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="import" '
        +   (this.mode === 'import' ? 'checked' : '') + '> Import to WP Media Library</label>'
        + '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="link" '
        +   (this.mode === 'link' ? 'checked' : '') + '> Link (Piwigo URL)</label>'
        + '</div>'
        + '<div class="piwigo-detail-status"></div>'
        + '<button class="piwigo-insert button button-primary">Insert into post</button>'
        + '</div>'
        + '</div>'
      );
      return this;
    },

    loadDetail: function () {
      var self = this;
      apiFetch('/photos/' + self.photo.id).done(function (photo) {
        self.fullPhoto = photo;
        var thumb = photo.medium_url || photo.thumb_url || '';
        self.$('.piwigo-detail-preview').html(thumb ? '<img src="' + thumb + '" alt="">' : '');
        self.$('.piwigo-detail-title').text(photo.title || '');
        self.$('.piwigo-detail-desc').text(photo.description || '');

        if (photo.wp_attachment_id) {
          self.$('.piwigo-detail-status').html(
            '<span class="piwigo-already-badge">' + (i18n.alreadyImported || '✓ Already imported') + '</span>'
          );
        }
      }).fail(function () {
        self.$('.piwigo-detail-preview').html('<p class="piwigo-error">Could not load photo details.</p>');
      });
    },

    changeMode: function (e) {
      this.mode = e.target.value;
    },

    insertPhoto: function () {
      var self = this;
      if (self.loading) return;

      self.loading = true;
      self.$('.piwigo-insert').prop('disabled', true).text('Inserting…');
      self.$('.piwigo-detail-status').text('');

      apiFetch('/import', {
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          piwigo_photo_id: self.photo.id,
          mode: self.mode,
        }),
      }).done(function (result) {
        self.loading = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');

        if (result.attachment_id) {
          // Trigger WP media selection with the new attachment
          self.trigger('photo:inserted', result.attachment_id);
        } else {
          self.$('.piwigo-detail-status').text('Error: unexpected response.');
        }
      }).fail(function (xhr) {
        self.loading = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');
        var msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : 'Request failed.';
        self.$('.piwigo-detail-status').text((i18n.error || 'Error: ') + msg);
      });
    },

    goBack: function () {
      this.trigger('back');
    },
  });

  // ── Content region: Piwigo browser ────────────────────────────────────────
  var PiwigoBrowserContent = wp.media.View.extend({
    className: 'piwigo-browser-content',

    initialize: function () {
      this.stack    = [];   // navigation stack: 'albums' | { albumId, albumName } | { photo }
      this.currentView = null;
      this.showAlbums();
    },

    showAlbums: function () {
      this.stack = [];
      var view = new AlbumsView();
      this.listenTo(view, 'album:select', this.showPhotos.bind(this));
      this.swapView(view);
    },

    showPhotos: function (albumId, albumName) {
      this.stack.push('albums');
      var view = new PhotosView({ albumId: albumId, albumName: albumName });
      this.listenTo(view, 'photo:select', this.showDetail.bind(this, albumId, albumName));
      this.listenTo(view, 'back',         this.showAlbums.bind(this));
      this.swapView(view);
    },

    showDetail: function (albumId, albumName, photo) {
      this.stack.push({ albumId: albumId, albumName: albumName });
      var view = new PhotoDetailView({ photo: photo, albumId: albumId, albumName: albumName });
      this.listenTo(view, 'back', this.showPhotos.bind(this, albumId, albumName));
      this.listenTo(view, 'photo:inserted', this.onInserted.bind(this));
      this.swapView(view);
    },

    onInserted: function (attachmentId) {
      // Load the WP attachment object and select it so native WP handles insertion
      var attachment = wp.media.attachment(attachmentId);
      attachment.fetch().done(function () {
        var frame = wp.media.frame;
        if (frame && frame.state) {
          var state = frame.state();
          if (state && state.get('selection')) {
            state.get('selection').reset([attachment]);
          }
        }
        // Trigger the native media insertion workflow
        if (frame) {
          frame.close();
          frame.trigger('select');
        }
      });
    },

    swapView: function (view) {
      if (this.currentView) {
        this.currentView.remove();
        this.stopListening(this.currentView);
      }
      this.currentView = view;
      this.$el.empty().append(view.render().$el);
    },

    render: function () {
      return this;
    },
  });

  // ── Hook into wp.media frame creation ────────────────────────────────────
  var originalMediaFrame = wp.media.view.MediaFrame.Select;
  wp.media.view.MediaFrame.Select = originalMediaFrame.extend({
    initialize: function () {
      originalMediaFrame.prototype.initialize.apply(this, arguments);
      this.states.add(new PiwigoBrowserState());
    },

    createRouter: function (routerView) {
      originalMediaFrame.prototype.createRouter.apply(this, arguments);
      routerView.set({
        'piwigo-browser': {
          text:     i18n.tabLabel || 'Piwigo',
          priority: 200,
        },
      });
    },
  });

  // Register the content view for the piwigo-browser state
  wp.media.view.MediaFrame.Select.prototype.browseContent = function (content) {
    var state = this.state();
    if (state.id === 'piwigo-browser') {
      content.view = new PiwigoBrowserContent({ controller: this });
    } else if (wp.media.view.MediaFrame.Select.prototype._browseContent) {
      wp.media.view.MediaFrame.Select.prototype._browseContent.call(this, content);
    }
  };

}(jQuery, wp));
