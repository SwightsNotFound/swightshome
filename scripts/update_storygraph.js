const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

async function scrapePage(url, status) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Scroll down to load more content
    await autoScroll(page);

    // Wait for the book panes to load
    await page.waitForSelector('.book-pane', { timeout: 60000 });

    const books = await page.evaluate((status) => {
        return Array.from(document.querySelectorAll('.book-pane')).map(book => ({
            title: book.querySelector('.book-title-author-and-series a').innerText,
            author: book.querySelector('.book-title-author-and-series a[href^="/authors"]').innerText,
            coverImage: book.querySelector('.book-cover img').src,
            averageRating: book.querySelector('.average-rating')?.innerText || 'N/A',
            pages: book.querySelector('.text-xs').innerText.split(' • ')[0],
            status: status,
            genres: Array.from(book.querySelectorAll('.book-pane-tag-section .inline-block')).map(tag => tag.innerText),
            format: book.querySelector('.edition-info .text-xs:nth-child(2) span')?.innerText || 'N/A',
            publicationDate: book.querySelector('.edition-info .text-xs:nth-child(5) span')?.innerText || 'N/A'
        }));
    }, status);

    await browser.close();
    return books;
}

async function fetchUserStoryGraphList() {
    try {
        const currentlyReading = await scrapePage('https://app.thestorygraph.com/currently-reading/swight', 'Currently reading');
        const readRecently = await scrapePage('https://app.thestorygraph.com/books-read/swight', 'Read recently');
        const toRead = await scrapePage('https://app.thestorygraph.com/to-read/swight', 'To read');

        const books = [...currentlyReading, ...readRecently, ...toRead];
        const filePath = path.join(__dirname, '..', 'storygraph_list.json');
        console.log(`Saving to: ${filePath}`);
        console.log(`Current working directory: ${process.cwd()}`);
        fs.writeFileSync(filePath, JSON.stringify(books, null, 2));
        console.log('StoryGraph list updated successfully.');
    } catch (error) {
        console.error('Error fetching user StoryGraph list:', error);
    }
}

fetchUserStoryGraphList();