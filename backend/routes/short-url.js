const express = require('express');
const router = express.Router();
const urlShortener = require('../services/urlShortener');

/**
 * Redirect short URL to full URL
 * GET /s/:code
 */
router.get('/:code', (req, res) => {
  try {
    const { code } = req.params;

    const fullUrl = urlShortener.getFullUrl(code);

    if (!fullUrl) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link Not Found</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
            h1 { font-size: 48px; margin: 0 0 20px 0; }
            p { font-size: 18px; margin: 0; opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 Link Not Found</h1>
            <p>This short link has expired or doesn't exist.</p>
            <p style="margin-top: 10px; font-size: 14px;">Support session links expire after 20 days.</p>
          </div>
        </body>
        </html>
      `);
    }

    console.log(`🔗 Redirecting ${code} -> ${fullUrl.substring(0, 50)}...`);

    // Redirect to full URL
    res.redirect(302, fullUrl);

  } catch (error) {
    console.error('Error in short URL redirect:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Get short URL statistics (for debugging)
 * GET /s-stats
 */
router.get('/stats', (req, res) => {
  try {
    const stats = urlShortener.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting short URL stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
