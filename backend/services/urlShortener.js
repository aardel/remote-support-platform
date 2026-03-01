class UrlShortenerService {
  constructor() {
    // Map of short code -> full URL
    this.urlMap = new Map();

    // Clean up old entries every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Generate a short code (5 characters, base62: a-zA-Z0-9)
   */
  generateShortCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';

    // Generate 5 random characters
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Check for collision (very rare with 62^5 = 916 million possibilities)
    if (this.urlMap.has(code)) {
      return this.generateShortCode(); // Retry
    }

    return code;
  }

  /**
   * Create a short URL
   * @param {string} fullUrl - The full URL to shorten
   * @param {number} expiresInMinutes - How long the short URL should be valid (default: 20 days for support sessions)
   * @returns {string} - The short code
   */
  createShortUrl(fullUrl, expiresInMinutes = 20 * 24 * 60) {
    const code = this.generateShortCode();
    const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);

    this.urlMap.set(code, {
      fullUrl,
      expiresAt,
      createdAt: Date.now(),
      accessCount: 0
    });

    const preview = fullUrl.length > 50 ? fullUrl.substring(0, 50) + '...' : fullUrl;
    console.log(`✂️ Short URL created: ${code} -> ${preview}`);
    return code;
  }

  /**
   * Get the full URL from a short code
   * @param {string} code - The short code
   * @returns {string|null} - The full URL or null if not found/expired
   */
  getFullUrl(code) {
    const entry = this.urlMap.get(code);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.urlMap.delete(code);
      console.log(`⏰ Short URL expired: ${code}`);
      return null;
    }

    // Increment access count
    entry.accessCount++;

    return entry.fullUrl;
  }

  /**
   * Delete a specific short URL
   * @param {string} code - The short code to delete
   * @returns {boolean} - True if deleted, false if not found
   */
  deleteShortUrl(code) {
    const deleted = this.urlMap.delete(code);
    if (deleted) {
      console.log(`🗑️ Short URL deleted: ${code}`);
    }
    return deleted;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [code, entry] of this.urlMap.entries()) {
      if (now > entry.expiresAt) {
        this.urlMap.delete(code);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired short URLs`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalUrls: this.urlMap.size,
      urls: Array.from(this.urlMap.entries()).map(([code, entry]) => ({
        code,
        fullUrl: entry.fullUrl.substring(0, 100),
        createdAt: new Date(entry.createdAt).toISOString(),
        expiresAt: new Date(entry.expiresAt).toISOString(),
        accessCount: entry.accessCount
      }))
    };
  }
}

// Export singleton instance
module.exports = new UrlShortenerService();
