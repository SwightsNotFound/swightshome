const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const config = {
  username: 'swight', // Your StoryGraph username
  cookie: null,
  outputDir: path.join(__dirname, 'storygraph-data'),
  headless: true,
  timeout: 60000,
  debug: true
};

if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    debug: '\x1b[35m',
    warning: '\x1b[33m'
  };
  const color = colors[type] || '\x1b[0m';
  console.log(`${color}[${new Date().toISOString()}] ${message}\x1b[0m`);
}

async function saveDomAndScreenshot(page, listType) {
  try {
    const debugDir = path.join(config.outputDir, 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
    await page.screenshot({
      path: path.join(debugDir, `${listType}-${Date.now()}.png`),
      fullPage: true
    });
    const html = await page.content();
    fs.writeFileSync(
      path.join(debugDir, `${listType}-${Date.now()}.html`),
      html
    );
    log(`Saved debug info for ${listType}`, 'debug');
  } catch (err) {
    log(`Failed to save debug info: ${err.message}`, 'error');
  }
}

class StoryGraphScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      timeout: config.timeout
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setDefaultTimeout(config.timeout);

    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (config.cookie) {
      await this.page.setCookie({
        name: 'remember_user_token',
        value: config.cookie,
        domain: 'app.thestorygraph.com'
      });
      log('Authentication cookie set', 'debug');
    }
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  /**
   * Wait for DOM to have either book cards or an empty state.
   * If timeout, logs out what *was* found on the page for easier debugging.
   */
  async waitForBooksOrEmpty(listType) {
    try {
      await this.page.waitForFunction(
        () =>
          document.querySelectorAll('a[href*="/books/"]').length > 0 ||
          document.querySelector('.empty-state') !== null,
        { timeout: config.timeout }
      );
    } catch (e) {
      log(`[${listType}] Wait for books/empty failed, dumping info:`, 'error');
      // Print what selectors are present:
      const selectors = await this.page.evaluate(() => ({
        books: document.querySelectorAll('a[href*="/books/"]').length,
        empty: !!document.querySelector('.empty-state'),
        pageText: document.body.innerText?.slice(0, 500),
      }));
      log(`[${listType}] Found anchors with /books/: ${selectors.books}, empty state: ${selectors.empty}`, 'debug');
      // Save DOM and screenshot
      await saveDomAndScreenshot(this.page, `${listType}-timeout`);
      throw new Error(`[${listType}] Timeout waiting for books or empty state. Details: ${JSON.stringify(selectors, null, 2)}`);
    }
  }

  /**
   * Extract only *real* book cards from the DOM via Puppeteer page context.
   */
  async extractBookList(listType) {
    const books = await this.page.evaluate(() => {
      // Find all anchor tags that link to a book
      const anchors = Array.from(document.querySelectorAll('a[href*="/books/"]'))
        .filter(a => a.offsetParent !== null)
        .filter((a, i, arr) => arr.findIndex(b => b.href === a.href) === i);

      return anchors.map(anchor => {
        let bookCard = anchor;
        for (let i = 0; i < 4; i++) {
          if (bookCard.parentElement) bookCard = bookCard.parentElement;
        }
        let title = anchor.querySelector('span')?.innerText || anchor.innerText || '';
        title = title.trim() || anchor.getAttribute('title') || '';

        let author = '';
        const authorSpan =
          anchor.parentElement?.querySelector('[class*="author"]') ||
          bookCard.querySelector('[class*="author"]') ||
          Array.from(bookCard.querySelectorAll('span')).find(s => /by /.test(s.innerText));
        if (authorSpan) {
          author = authorSpan.innerText.replace(/^by /, '').trim();
        }
        let coverImage = '';
        const img = anchor.querySelector('img') || bookCard.querySelector('img');
        if (img) coverImage = img.src;

        const url = anchor.href;
        const id = url.split('/').pop();

        const genres = Array.from(bookCard.querySelectorAll('[class*="tag"], [class*="genre"], .chip, .pill'))
          .map(e => e.innerText.trim())
          .filter(Boolean);

        let pages = 'N/A';
        let format = 'Book';
        const metaText = bookCard.innerText || '';
        const pagesMatch = metaText.match(/(\d+)\s*pages/);
        if (pagesMatch) {
          pages = pagesMatch[1];
        }
        const minutesMatch = metaText.match(/(\d+)\s*minutes/);
        if (minutesMatch) {
          format = 'Audiobook';
          pages = `${minutesMatch[1]} minutes`;
        }

        return {
          id,
          title,
          author,
          coverImage,
          pages,
          format,
          genres,
          url
        };
      });
    });
    log(`[${listType}] Extracted ${books.length} books from DOM.`, 'debug');
    return books;
  }

  async scrapeList(url, listType) {
    try {
      log(`Scraping ${listType} list from ${url}`, 'info');
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: config.timeout });
      await this.waitForBooksOrEmpty(listType);
      await this.autoScroll();
      await saveDomAndScreenshot(this.page, listType);

      // Is list empty?
      const isEmpty = await this.page.$('.empty-state');
      if (isEmpty) {
        log(`No books found in ${listType} list (empty state detected)`, 'warning');
        return [];
      }

      const books = await this.extractBookList(listType);
      if (!books || books.length === 0) {
        log(`No books found in ${listType} list after extraction`, 'warning');
      }
      books.forEach((bk, i) =>
        log(`[${listType}] Book #${i + 1}: ${bk.title} by ${bk.author} (${bk.url})`, 'debug')
      );
      return books;
    } catch (error) {
      log(`Error scraping ${listType} list: ${error.message}`, 'error');
      await saveDomAndScreenshot(this.page, `${listType}-error`);
      log(error.stack, 'error');
      return [];
    }
  }

  async scrapeAllData() {
    try {
      await this.initialize();
      const lists = {
        'currently-reading': 'Currently Reading',
        'to-read': 'To Read',
        'books-read': 'Read'
      };
      const allBooks = [];

      for (const [path, status] of Object.entries(lists)) {
        const url = `https://app.thestorygraph.com/${path}/${config.username}`;
        const books = await this.scrapeList(url, status);
        allBooks.push(...books);
      }

      // Remove duplicates by ID
      const uniqueBooks = allBooks.filter(
        (b, i, arr) => arr.findIndex(other => other.id && b.id && other.id === b.id) === i
      );

      // Save all data
      const outputPath = path.join(config.outputDir, 'storygraph-data.json');
      fs.writeFileSync(outputPath, JSON.stringify(uniqueBooks, null, 2));
      log(`All data saved to ${outputPath}`, 'success');
      return uniqueBooks;
    } catch (error) {
      log(`Scraping failed: ${error.message}`, 'error');
      throw error;
    } finally {
      if (this.browser) await this.browser.close();
    }
  }

  generateStats(books) {
    const stats = {
      totalBooks: books.length,
      currentlyReading: books.filter(b => b.status === 'Currently Reading').length,
      toRead: books.filter(b => b.status === 'To Read').length,
      read: books.filter(b => b.status === 'Read').length,
      totalPages: 0,
      totalAudiobookMinutes: 0,
      genres: {}
    };

    books.forEach(book => {
      if (book.format === 'Book' && book.pages !== 'N/A') {
        const pages = parseInt(book.pages);
        if (!isNaN(pages)) stats.totalPages += pages;
      }
      if (book.format === 'Audiobook' && typeof book.pages === 'string' && book.pages.includes('minutes')) {
        const minutes = parseInt(book.pages);
        if (!isNaN(minutes)) stats.totalAudiobookMinutes += minutes;
      }
      if (book.genres && Array.isArray(book.genres)) {
        book.genres.forEach(genre => {
          stats.genres[genre] = (stats.genres[genre] || 0) + 1;
        });
      }
    });

    stats.genres = Object.fromEntries(
      Object.entries(stats.genres).sort((a, b) => b[1] - a[1])
    );

    const statsPath = path.join(config.outputDir, 'storygraph-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    log(`Statistics saved to ${statsPath}`, 'success');

    return stats;
  }
}

// Main runner
(async () => {
  try {
    const scraper = new StoryGraphScraper();
    const books = await scraper.scrapeAllData();
    const stats = scraper.generateStats(books);

    console.log('\n=== SCRAPING COMPLETE ===');
    console.log(`Total books found: ${stats.totalBooks}`);
    console.log(`- Currently reading: ${stats.currentlyReading}`);
    console.log(`- To read: ${stats.toRead}`);
    console.log(`- Read: ${stats.read}`);
    console.log(`Total pages read: ${stats.totalPages}`);
    console.log(`Total audiobook minutes: ${stats.totalAudiobookMinutes}`);
    console.log('\nTop genres:');
    console.log(
      Object.entries(stats.genres)
        .slice(0, 5)
        .map(([genre, count]) => `- ${genre}: ${count}`)
        .join('\n')
    );
  } catch (error) {
    console.error('Script failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
})();