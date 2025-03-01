const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

async function getPublicationDateFromOpenLibrary(title, author) {
    try {
        const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
        const response = await axios.get(searchUrl);
        const book = response.data.docs[0];
        if (book) {
            const publicationDate = book.first_publish_year || 'N/A';
            return publicationDate;
        }
        return 'N/A';
    } catch (error) {
        console.error(`Error fetching details for ${title} by ${author}:`, error);
        return 'N/A';
    }
}

async function getPublicationDateFromAudible(title, author) {
    try {
        const searchUrl = `https://www.audible.com/search?keywords=${encodeURIComponent(title + ' ' + author)}`;
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        const publicationDate = await page.evaluate(() => {
            const dateElement = document.querySelector('.releaseDateLabel span');
            if (dateElement) {
                const dateText = dateElement.textContent.trim();
                const yearMatch = dateText.match(/\d{2}-\d{2}-(\d{2})/);
                if (yearMatch) {
                    return `20${yearMatch[1]}`; // Assuming 20xx for the year
                }
            }
            return 'N/A';
        });

        await browser.close();
        return publicationDate;
    } catch (error) {
        console.error(`Error fetching details for ${title} by ${author} from Audible:`, error);
        return 'N/A';
    }
}

async function scrapePage(url, status) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Scroll down to load more content
    await autoScroll(page);

    // Wait for the book panes to load
    await page.waitForSelector('.book-pane', { timeout: 60000 });

    const books = await page.evaluate((status) => {
        return Array.from(document.querySelectorAll('.book-pane')).map(book => {
            const pagesText = book.querySelector('.text-xs').innerText.split(' • ')[0];
            let format = 'N/A';
            if (pagesText.includes('pages')) {
                format = 'Book';
            } else if (pagesText.includes('minutes')) {
                format = 'Audiobook';
            }

            return {
                title: book.querySelector('.book-title-author-and-series a').innerText,
                author: book.querySelector('.book-title-author-and-series a[href^="/authors"]').innerText,
                coverImage: book.querySelector('.book-cover img').src,
                pages: pagesText,
                status: status,
                genres: Array.from(book.querySelectorAll('.book-pane-tag-section .inline-block')).map(tag => tag.innerText),
                format: format,
            };
        });
    }, status);

    for (const book of books) {
        if (book.format === 'Audiobook') {
            book.publicationDate = await getPublicationDateFromAudible(book.title, book.author);
        } else {
            book.publicationDate = await getPublicationDateFromOpenLibrary(book.title, book.author);
        }
        console.log(`Fetched details for ${book.title}: Publication Date - ${book.publicationDate}`);
    }

    await browser.close();
    return books;
}

async function fetchUserStoryGraphList() {
    try {
        const currentlyReading = await scrapePage('https://app.thestorygraph.com/currently-reading/swight', 'Currently reading');
        const readRecently = await scrapePage('https://app.thestorygraph.com/books-read/swight', 'Read recently');
        const toRead = await scrapePage('https://app.thestorygraph.com/to-read/swight', 'To read');

        const books = [...currentlyReading, ...readRecently, ...toRead];
        console.log(`Total books found: ${books.length}`);

        if (books.length === 0) {
            throw new Error('No books found. Scraping might have failed.');
        }

        const filePath = path.join(__dirname, '..', 'storygraph_list.json');
        console.log(`Saving to: ${filePath}`);
        console.log(`Current working directory: ${process.cwd()}`);
        fs.writeFileSync(filePath, JSON.stringify(books, null, 2));
        console.log('StoryGraph list updated successfully.');

        // List directory contents to verify file creation
        const dirContents = fs.readdirSync(path.dirname(filePath));
        console.log('Directory contents:', dirContents);
    } catch (error) {
        console.error('Error fetching user StoryGraph list:', error);
        fs.writeFileSync(path.join(__dirname, '..', 'storygraph_list.json'), '{}');
    }
}

fetchUserStoryGraphList();