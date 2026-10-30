/**
 * The Docker image starts as root only to fix the data folder's owner, so
 * `docker compose exec openrun node <script>` runs as root too. Scripts call
 * this first, so files they create stay writable by the server, which runs
 * as `node`.
 */
export function dropRoot() {
  if (process.getuid?.() !== 0) return;
  try {
    process.setgid?.('node');
    process.setuid?.('node');
  } catch {
    // No `node` user (not the Docker image): carry on as root.
  }
}
