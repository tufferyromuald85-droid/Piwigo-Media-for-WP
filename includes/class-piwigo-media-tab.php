<?php
defined('ABSPATH') or die('No direct access.');

/**
 * Injects the "Piwigo" tab into the WordPress media modal
 * and enqueues the required JS/CSS assets.
 */
class Piwigo_Media_Tab
{
  public static function admin_init(): void
  {
    add_action('admin_enqueue_scripts', array(self::class, 'enqueue'));
  }

  public static function enqueue(string $hook): void
  {
    // Only load on pages that use the media modal
    $modal_hooks = array('post.php', 'post-new.php', 'upload.php', 'media.php');
    if (!in_array($hook, $modal_hooks, true)) {
      return;
    }

    $server_url = get_option('piwigo_media_server_url', '');
    if (empty($server_url)) {
      return; // Plugin not configured — don't inject broken tab
    }

    // Make sure the native media scripts are loaded
    wp_enqueue_media();

    wp_enqueue_style(
      'piwigo-media',
      PIWIGO_MEDIA_URL . 'assets/css/piwigo-media.css',
      array(),
      PIWIGO_MEDIA_VERSION
    );

    wp_enqueue_script(
      'piwigo-media-frame',
      PIWIGO_MEDIA_URL . 'assets/js/piwigo-media-frame.js',
      array('jquery', 'media-views', 'wp-api-fetch'),
      PIWIGO_MEDIA_VERSION,
      true
    );

    // Pass config to JS
    wp_localize_script('piwigo-media-frame', 'piwigoMediaConfig', array(
      'apiBase'     => esc_url(rest_url('piwigo-media/v1')),
      'nonce'       => wp_create_nonce('wp_rest'),
      'defaultMode' => get_option('piwigo_media_default_mode', 'import'),
      'serverUrl'   => esc_url($server_url),
      'i18n'        => array(
        'tabLabel'      => 'Piwigo',
        'loading'       => 'Loading…',
        'selectBtn'     => 'Insert from Piwigo',
        'alreadyImported'=> 'Already imported',
        'noPhotos'      => 'No photos in this album.',
        'noAlbums'      => 'No albums found.',
        'error'         => 'Error: ',
      ),
    ));
  }
}
