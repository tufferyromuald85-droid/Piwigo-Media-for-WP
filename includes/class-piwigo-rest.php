<?php
defined('ABSPATH') or die('No direct access.');

/**
 * Registers all WP REST API routes under /wp-json/piwigo-media/v1/
 */
class Piwigo_Rest
{
  const NS = 'piwigo-media/v1';

  public static function register_routes(): void
  {
    // Gutenberg block inserter endpoint (registerInserterMediaCategory fetch)
    register_rest_route(self::NS, '/inserter-photos', array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => array(self::class, 'get_inserter_photos'),
      'permission_callback' => array(self::class, 'can_upload'),
      'args'                => array(
        'search'   => array('type' => 'string',  'default' => ''),
        'per_page' => array('type' => 'integer', 'default' => 20, 'minimum' => 1, 'maximum' => 80),
        'page'     => array('type' => 'integer', 'default' => 1,  'minimum' => 1),
      ),
    ));

    register_rest_route(self::NS, '/albums', array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => array(self::class, 'get_albums'),
      'permission_callback' => array(self::class, 'can_upload'),
    ));

    register_rest_route(self::NS, '/albums/(?P<id>\d+)/photos', array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => array(self::class, 'get_album_photos'),
      'permission_callback' => array(self::class, 'can_upload'),
      'args'                => array(
        'id'       => array('type' => 'integer', 'required' => true, 'minimum' => 1),
        'page'     => array('type' => 'integer', 'default'  => 1,    'minimum' => 1),
        'per_page' => array('type' => 'integer', 'default'  => 24,   'minimum' => 1, 'maximum' => 100),
      ),
    ));

    register_rest_route(self::NS, '/photos/(?P<id>\d+)', array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => array(self::class, 'get_photo'),
      'permission_callback' => array(self::class, 'can_upload'),
      'args'                => array(
        'id' => array('type' => 'integer', 'required' => true, 'minimum' => 1),
      ),
    ));

    register_rest_route(self::NS, '/import', array(
      'methods'             => WP_REST_Server::CREATABLE,
      'callback'            => array(self::class, 'import_photo'),
      'permission_callback' => array(self::class, 'can_upload'),
      'args'                => array(
        'piwigo_photo_id'  => array('type' => 'integer', 'required' => true, 'minimum' => 1),
        'mode'             => array('type' => 'string',  'default'  => 'import', 'enum' => array('import', 'link')),
        'target_post_id'   => array('type' => 'integer', 'default'  => 0),
        'piwigo_server_url'=> array('type' => 'string',  'default'  => ''),
      ),
    ));

    register_rest_route(self::NS, '/import/batch', array(
      'methods'             => WP_REST_Server::CREATABLE,
      'callback'            => array(self::class, 'import_batch'),
      'permission_callback' => array(self::class, 'can_upload'),
      'args'                => array(
        'piwigo_photo_ids' => array('type' => 'array', 'required' => true, 'items' => array('type' => 'integer', 'minimum' => 1)),
        'mode'             => array('type' => 'string', 'default' => 'import', 'enum' => array('import', 'link')),
        'target_post_id'   => array('type' => 'integer', 'default' => 0),
        'piwigo_server_url'=> array('type' => 'string',  'default' => ''),
      ),
    ));

    // Proxy route for private album images (optional, when proxy_enabled=1)
    register_rest_route(self::NS, '/proxy/(?P<id>\d+)', array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => array(self::class, 'proxy_image'),
      'permission_callback' => '__return_true', // public: serves the image
      'args'                => array(
        'id' => array('type' => 'integer', 'required' => true, 'minimum' => 1),
      ),
    ));
  }

  // ── Permission callback ────────────────────────────────────────────────────

  public static function can_upload(WP_REST_Request $request): bool
  {
    // Standard WP user (nonce or Application Password)
    if (current_user_can('upload_files')) {
      return true;
    }
    return false;
  }

  // ── Route handlers ─────────────────────────────────────────────────────────

  public static function get_inserter_photos(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $api  = new Piwigo_Api();
    $data = $api->search_photos(
      sanitize_text_field($request['search']),
      (int) $request['page'],
      (int) $request['per_page']
    );

    if (is_wp_error($data)) return $data;

    $images = $data['result']['images'] ?? array();
    return rest_ensure_response(array_map(array(self::class, 'format_photo'), $images));
  }

  public static function get_albums(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $api  = new Piwigo_Api();
    $data = $api->get_albums();

    if (is_wp_error($data)) return $data;

    $albums = $data['result']['categories'] ?? array();
    return rest_ensure_response(array_map(array(self::class, 'format_album'), $albums));
  }

  public static function get_album_photos(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $api  = new Piwigo_Api();
    $data = $api->get_album_photos(
      (int) $request['id'],
      (int) $request['page'],
      (int) $request['per_page']
    );

    if (is_wp_error($data)) return $data;

    $images = $data['result']['images'] ?? array();
    $paging = $data['result']['paging'] ?? array();

    return rest_ensure_response(array(
      'photos'    => array_map(array(self::class, 'format_photo'), $images),
      'total'     => (int) ($paging['total_count'] ?? count($images)),
      'page'      => (int) ($request['page']),
      'per_page'  => (int) ($request['per_page']),
    ));
  }

  public static function get_photo(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $api  = new Piwigo_Api();
    $data = $api->get_photo((int) $request['id']);

    if (is_wp_error($data)) return $data;

    $photo = $data['result'] ?? array();
    $formatted = self::format_photo($photo);

    // Check if already imported in WP
    $existing = self::find_wp_attachment((int) $request['id']);
    $formatted['wp_attachment_id'] = $existing ? $existing->ID : null;

    return rest_ensure_response($formatted);
  }

  public static function import_photo(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $importer = new Piwigo_Importer();
    $result   = $importer->import(
      (int)    $request['piwigo_photo_id'],
               $request['mode'],
      (int)    $request['target_post_id'],
               $request['piwigo_server_url']
    );

    if (is_wp_error($result)) return $result;

    return rest_ensure_response(array_merge(array('success' => true), $result));
  }

  public static function import_batch(WP_REST_Request $request): WP_REST_Response|WP_Error
  {
    $importer  = new Piwigo_Importer();
    $ids       = array_map('intval', $request['piwigo_photo_ids']);
    $mode      = $request['mode'];
    $target_id = (int) $request['target_post_id'];
    $server    = $request['piwigo_server_url'];

    $imported  = array();
    $errors    = array();

    foreach ($ids as $photo_id) {
      $result = $importer->import($photo_id, $mode, $target_id, $server);
      if (is_wp_error($result)) {
        $errors[] = array('photo_id' => $photo_id, 'error' => $result->get_error_message());
      } else {
        $imported[] = $result;
      }
    }

    $post_edit_url = null;
    if ($target_id > 0) {
      $post_edit_url = get_edit_post_link($target_id, 'raw');
    }

    // If only one photo imported and target set, propose as featured image
    if (count($imported) === 1 && $target_id > 0 && !empty($imported[0]['attachment_id'])) {
      set_post_thumbnail($target_id, $imported[0]['attachment_id']);
    }

    return rest_ensure_response(array(
      'success'      => empty($errors),
      'imported'     => count($imported),
      'attachments'  => $imported,
      'errors'       => $errors,
      'post_edit_url'=> $post_edit_url,
    ));
  }

  public static function proxy_image(WP_REST_Request $request): void
  {
    if (get_option('piwigo_media_proxy_enabled', '0') !== '1') {
      status_header(403);
      exit;
    }

    $piwigo_id = (int) $request['id'];

    // Gate: an active WP attachment must be linked to this Piwigo photo ID.
    // Without this check, the proxy would serve any photo by ID enumeration,
    // and deleting the WP attachment would not revoke access.
    if (!self::find_wp_attachment($piwigo_id)) {
      status_header(404);
      exit;
    }

    $api = new Piwigo_Api();
    $url = $api->get_photo_url($piwigo_id);

    if (is_wp_error($url)) {
      status_header(404);
      exit;
    }

    $response = wp_remote_get($url, array('timeout' => 30));
    if (is_wp_error($response)) {
      status_header(502);
      exit;
    }

    $content_type = wp_remote_retrieve_header($response, 'content-type') ?: 'image/jpeg';
    header('Content-Type: ' . $content_type);
    header('Cache-Control: public, max-age=86400');
    echo wp_remote_retrieve_body($response);
    exit;
  }

  // ── Formatters ─────────────────────────────────────────────────────────────

  private static function format_album(array $cat): array
  {
    // getAdminList doesn't return id_uppercat but includes uppercats (ancestor path CSV)
    $parent_id = null;
    if (isset($cat['id_uppercat'])) {
      $parent_id = (int) $cat['id_uppercat'];
    } elseif (!empty($cat['uppercats'])) {
      $parts = array_filter(explode(',', (string) $cat['uppercats']));
      if (count($parts) > 1) {
        array_pop($parts); // remove own ID (last element)
        $parent_id = (int) end($parts);
      }
    }

    return array(
      'id'              => (int) $cat['id'],
      'name'            => $cat['name'] ?? '',
      'comment'         => $cat['comment'] ?? '',
      'nb_images'       => (int) ($cat['nb_images'] ?? 0),
      'total_nb_images' => (int) ($cat['total_nb_images'] ?? $cat['nb_images'] ?? 0),
      'thumbnail_url'   => $cat['tn_url'] ?? null,
      'parent_id'       => $parent_id,
      'is_private'      => ($cat['status'] ?? 'public') === 'private',
    );
  }

  private static function format_photo(array $img): array
  {
    $derivatives = $img['derivatives'] ?? array();
    $thumb_url   = $derivatives['thumb']['url'] ?? ($derivatives['small']['url'] ?? null);
    $medium_url  = $derivatives['medium']['url'] ?? ($thumb_url);

    return array(
      'id'          => (int) ($img['id'] ?? 0),
      'title'       => $img['name'] ?? '',
      'description' => $img['comment'] ?? '',
      'filename'    => $img['file'] ?? '',
      'width'       => (int) ($img['width'] ?? 0),
      'height'      => (int) ($img['height'] ?? 0),
      'thumb_url'   => $thumb_url,
      'medium_url'  => $medium_url,
      'date_created'=> $img['date_creation'] ?? null,
      'tags'        => array_column($img['tags'] ?? array(), 'name'),
      'author'      => $img['author'] ?? '',
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private static function find_wp_attachment(int $piwigo_id): ?WP_Post
  {
    $posts = get_posts(array(
      'post_type'  => 'attachment',
      'meta_key'   => '_piwigo_photo_id',
      'meta_value' => $piwigo_id,
      'numberposts'=> 1,
      'post_status'=> 'any',
    ));
    return $posts[0] ?? null;
  }
}
