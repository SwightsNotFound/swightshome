const fs = require('fs');

// Read the storygraph_list.json file
fs.readFile('storygraph_list.json', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading storygraph_list.json:', err);
    return;
  }

  // Parse the JSON data
  const books = JSON.parse(data);

  // Initialize statistics
  let totalBooksRead = 0;
  let totalPagesRead = 0;
  let totalMinutesListened = 0;

  // Helper function to convert time string to minutes
  const timeToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(' hours, ').map(str => parseInt(str, 10));
    return (hours * 60) + minutes;
  };

  // Calculate statistics
  books.forEach(book => {
    if (book.status === 'Read recently') {
      totalBooksRead++;

      if (book.format === 'Book') {
        const pages = parseInt(book.pages.split(' ')[0], 10);
        totalPagesRead += pages;
      } else if (book.format === 'Audiobook') {
        const minutes = timeToMinutes(book.pages);
        totalMinutesListened += minutes;
      }
    }
  });

  // Prepare the statistics object
  const stats = {
    totalBooksRead,
    totalPagesRead,
    totalMinutesListened
  };

  // Write the statistics to storygraph_stats.json
  fs.writeFile('storygraph_stats.json', JSON.stringify(stats, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Error writing storygraph_stats.json:', err);
      return;
    }

    console.log('Statistics written to storygraph_stats.json');
  });
});