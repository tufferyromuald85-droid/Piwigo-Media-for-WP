<?php
defined('ABSPATH') or die('No direct access.');

/**
 * Handles downloading Piwigo photos into WP Media Library (import mode)
 * and creating external attachment references (link mode).
 */
class Piwigo_Importer
{
  private Piwigo_Api $api;
  private array      $mapping;

  public function __construct()
  {
    $this->api = new Piwigo_Api();

    $raw           = get_option('piwigo_media_meta_mapping', '');
    $this->mapping = $raw ? unserialize($raw) : array(
      'title'       => true,
      'description' => true,
      'tags'        => true,
      'exif'        => true,
      'alt_auto'    => true,
    );
  }

  /**
   * Import or link a single Piwigo photo.
   *
   * @param  int    $photo_id      Piwigo image ID
   * @param  string $mode          'import' or 'link'
   * @param  int    $target_post_id Optional WP post to attach to
   * @param  string $server_url    Piwigo server URL override (from WPConnector push)
   * @return array|WP_Error        Array with attachment_id, attachment_url
   */
  public function import(int $photo_id, string $mode = 'import', int $target_post_id = 0, string $server_url = ''): array|WP_Error
  {
    // Check for existing import
    $existing = $this->find_existing($photo_id);
    if ($existing) {
      return array(
        'attachment_id'  => $existing->ID,
        'attachment_url' => wp_get_attachment_url($existing->ID),
        'already_existed'=> true,
      );
    }

    // Fetch photo metadata from Piwigo
    $data = $this->api->get_photo($photo_id);
    if (is_wp_error($data)) return $data;

    $info = $data['result'] ?? array();

    return $mode === 'link'
      ? $this->create_link($info, $target_post_id, $server_url)
      : $this->download_and_create($info, $photo_id, $target_post_id, $server_url);
  }

  // ── Import mode ────────────────────────────────────────────────────────────

  private function download_and_create(array $info, int $photo_id, int $target_post_id, string $server_url): array|WP_Error
  {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    // Resolve download URL
    $file_url = $this->resolve_source_url($info, $server_url);
    if (is_wp_error($file_url)) return $file_url;

    // Download to a temporary file. Private Piwigo photos require API key auth
    // even when the metadata request already succeeded.
    $tmp = $this->api->download_url_to_temp($file_url, $info['file'] ?? ('piwigo-' . $photo_id));
    if (is_wp_error($tmp)) {
      return new WP_Error('piwigo_download', 'Could not download photo: ' . $tmp->get_error_message());
    }

    $filename  = sanitize_file_name($info['file'] ?? ('piwigo-' . $photo_id . '.jpg'));
    $file_array = array(
      'name'     => $filename,
      'tmp_name' => $tmp,
    );

    // Build attachment args
    $attachment_args = $this->build_attachment_args($info, $target_post_id);

    // Use media_handle_sideload to move tmp file into uploads and create attachment
    $attachment_id = media_handle_sideload($file_array, $target_post_id, $attachment_args['post_title'], $attachment_args);

    // Clean up tmp even on error
    @unlink($tmp);

    if (is_wp_error($attachment_id)) {
      return new WP_Error('piwigo_sideload', 'Sideload failed: ' . $attachment_id->get_error_message());
    }

    $this->apply_metadata($attachment_id, $info, $photo_id, $server_url ?: get_option('piwigo_media_server_url', ''));

    return array(
      'attachment_id'  => $attachment_id,
      'attachment_url' => wp_get_attachment_url($attachment_id),
    );
  }

  // ── Link mode ──────────────────────────────────────────────────────────────

  private function create_link(array $info, int $target_post_id, string $server_url): array|WP_Error
  {
    $proxy_enabled = get_option('piwigo_media_proxy_enabled', '0') === '1';
    $photo_id      = (int) ($info['id'] ?? 0);

    if ($proxy_enabled && $photo_id) {
      $image_url = rest_url('piwigo-media/v1/proxy/' . $photo_id);
    } else {
      $image_url = $this->resolve_source_url($info, $server_url);
      if (is_wp_error($image_url)) return $image_url;
    }

    $filename = sanitize_file_name($info['file'] ?? ('piwigo-' . $photo_id . '.jpg'));
    $title    = !empty($info['name']) ? sanitize_text_field($info['name']) : pathinfo($filename, PATHINFO_FILENAME);

    $attachment_id = wp_insert_attachment(array(
      'post_title'     => $title,
      'post_content'   => sanitize_textarea_field($info['comment'] ?? ''),
      'post_status'    => 'inherit',
      'post_type'      => 'attachment',
      'post_mime_type' => $this->guess_mime($filename),
      'post_parent'    => $target_post_id ?: 0,
      'guid'           => $image_url,
    ), false, $target_post_id ?: 0);

    if (is_wp_error($attachment_id)) return $attachment_id;

    // Store the external URL in a dedicated meta — NOT in _wp_attached_file.
    // wp_get_attachment_url() always prepends the WP uploads base URL to
    // _wp_attached_file, which turns an external URL into garbage.
    // The wp_get_attachment_url filter in piwigo-media.php reads this meta instead.
    update_post_meta($attachment_id, '_piwigo_file_url', $image_url);
    $this->apply_metadata($attachment_id, $info, $photo_id, $server_url ?: get_option('piwigo_media_server_url', ''));

    return array(
      'attachment_id'  => $attachment_id,
      'attachment_url' => $image_url,
    );
  }

  // ── Metadata ───────────────────────────────────────────────────────────────

  private function build_attachment_args(array $info, int $parent_id): array
  {
    $filename = $info['file'] ?? '';
    $title    = !empty($info['name']) ? sanitize_text_field($info['name'])
                                      : pathinfo(sanitize_file_name($filename), PATHINFO_FILENAME);
    $args = array(
      'post_title'   => $this->mapping['title']       ? $title : '',
      'post_content' => $this->mapping['description'] ? sanitize_textarea_field($info['comment'] ?? '') : '',
      'post_parent'  => $parent_id ?: 0,
    );

    // Date from creation date
    if (!empty($info['date_creation'])) {
      $args['post_date'] = date('Y-m-d H:i:s', strtotime($info['date_creation']));
    }

    return $args;
  }

  private function apply_metadata(int $attachment_id, array $info, int $piwigo_id, string $server_url): void
  {
    // Always store Piwigo reference
    update_post_meta($attachment_id, '_piwigo_photo_id',   $piwigo_id);
    update_post_meta($attachment_id, '_piwigo_server_url', $server_url);

    // Alt text
    if ($this->mapping['alt_auto'] ?? true) {
      $alt = !empty($info['name'])
        ? sanitize_text_field($info['name'])
        : pathinfo(sanitize_file_name($info['file'] ?? ''), PATHINFO_FILENAME);
      update_post_meta($attachment_id, '_wp_attachment_image_alt', $alt);
    }

    // Tags → WP media tags (requires Media Tags or WP 6.9+)
    if (($this->mapping['tags'] ?? true) && !empty($info['tags']) && taxonomy_exists('media_tag')) {
      $tag_names = wp_list_pluck($info['tags'], 'name');
      wp_set_object_terms($attachment_id, $tag_names, 'media_tag');
    }

    // EXIF / custom meta
    if ($this->mapping['exif'] ?? true) {
      if (!empty($info['date_creation'])) {
        update_post_meta($attachment_id, '_piwigo_date_creation', sanitize_text_field($info['date_creation']));
      }
      update_post_meta($attachment_id, '_piwigo_date_available', sanitize_text_field($info['date_available'] ?? ''));
      update_post_meta($attachment_id, '_piwigo_author',         sanitize_text_field($info['author']         ?? ''));

      $lat = $info['latitude']  ?? ($info['exif']['computed']['GPSLatitude']  ?? null);
      $lng = $info['longitude'] ?? ($info['exif']['computed']['GPSLongitude'] ?? null);
      if ($lat) update_post_meta($attachment_id, '_piwigo_lat', (float) $lat);
      if ($lng) update_post_meta($attachment_id, '_piwigo_lng', (float) $lng);

      $make  = $info['exif']['COMPUTED']['Make']  ?? ($info['exif']['IFD0']['Make']  ?? '');
      $model = $info['exif']['COMPUTED']['Model'] ?? ($info['exif']['IFD0']['Model'] ?? '');
      if ($make || $model) {
        update_post_meta($attachment_id, '_piwigo_camera', trim($make . ' ' . $model));
      }

      $iso = $info['exif']['EXIF']['ISOSpeedRatings'] ?? '';
      if ($iso) update_post_meta($attachment_id, '_piwigo_iso', sanitize_text_field((string) $iso));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private function resolve_source_url(array $info, string $server_url): string|WP_Error
  {
    // download_url points to Piwigo action.php; server-side requests add API
    // auth in Piwigo_Api::get_authenticated_url().
    if (!empty($info['download_url'])) {
      return $info['download_url'];
    }

    // file_url is the direct download link some Piwigo versions provide.
    if (!empty($info['file_url'])) {
      return $info['file_url'];
    }

    // Derivatives
    $derivatives = $info['derivatives'] ?? array();
    foreach (array('original', 'xxlarge', 'xlarge', 'large', 'medium') as $size) {
      if (!empty($derivatives[$size]['url'])) {
        return $derivatives[$size]['url'];
      }
    }

    // Fallback: reconstruct from server URL + path
    $base = rtrim($server_url ?: get_option('piwigo_media_server_url', ''), '/');
    $path = $info['element_url'] ?? '';
    if ($base && $path) {
      return $base . '/' . ltrim($path, '/');
    }

    return new WP_Error('piwigo_no_url', 'Cannot resolve download URL for photo ID ' . ($info['id'] ?? '?'));
  }

  private function find_existing(int $piwigo_id): ?WP_Post
  {
    $posts = get_posts(array(
      'post_type'   => 'attachment',
      'meta_key'    => '_piwigo_photo_id',
      'meta_value'  => $piwigo_id,
      'numberposts' => 1,
      'post_status' => 'any',
    ));
    return $posts[0] ?? null;
  }

  private function guess_mime(string $filename): string
  {
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    return match ($ext) {
      'jpg', 'jpeg' => 'image/jpeg',
      'png'         => 'image/png',
      'gif'         => 'image/gif',
      'webp'        => 'image/webp',
      'avif'        => 'image/avif',
      'tiff', 'tif' => 'image/tiff',
      default       => 'image/jpeg',
    };
  }
}
