// =================================================================
//                      IMPORTS
// =================================================================
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // .verbose() for more detailed error messages
const cors = require('cors');
const path = require('path'); // Import the path module

// =================================================================
//                      CONFIGURATION
// =================================================================
const app = express();
const PORT = 5001; // Port for our backend server
// Correctly reference the cinema.db file in the same directory
const DB_PATH = path.join(__dirname, 'cinema.db');

// =================================================================
//                      DATABASE CONNECTION
// =================================================================
// Connect to the SQLite database.
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Successfully connected to the database.");
  }
});

// =================================================================
//                      MIDDLEWARE
// =================================================================
app.use(cors()); // Enable Cross-Origin Resource Sharing for all routes
app.use(express.json()); // Enable the express server to parse incoming JSON payloads

// =================================================================
//                      API ENDPOINTS / ROUTES
// =================================================================

// --- Test Route ---
// A simple route to check if the server is up and running.
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to the Cinema Booking API!' });
});


// --- GET All Movies ---
// Fetches a list of all available movies from the database.
app.get('/api/movies', (req, res) => {
  const sql = `SELECT * FROM Movies`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(200).json({ movies: rows });
  });
});


// --- GET a Single Movie with its Showtimes ---
// Fetches detailed information for a specific movie, including its showtimes.
app.get('/api/movies/:id', (req, res) => {
  const movieId = req.params.id;
  
  // This SQL query joins Movies, Showtimes, and Theaters to get all needed info
  const sql = `
    SELECT
      m.id as movieId,
      m.title,
      m.genre,
      m.duration_minutes,
      m.poster_url,
      s.id as showtimeId,
      s.show_time,
      t.name as theaterName,
      t.capacity
    FROM Movies m
    JOIN Showtimes s ON m.id = s.movie_id
    JOIN Theaters t ON s.theater_id = t.id
    WHERE m.id = ?
    ORDER BY s.show_time;
  `;

  db.all(sql, [movieId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (rows.length === 0) {
      // If the movie exists but has no showtimes, we should still return movie data
      const movieSql = `SELECT * FROM Movies WHERE id = ?`;
      db.get(movieSql, [movieId], (err, movie) => {
          if (err) {
              return res.status(500).json({ error: err.message });
          }
          if (movie) {
              res.status(200).json({ ...movie, showtimes: [] });
          } else {
              res.status(404).json({ message: "Movie not found." });
          }
      });
      return;
    }

    // Structure the response to be more frontend-friendly
    const movieDetails = {
      id: rows[0].movieId,
      title: rows[0].title,
      genre: rows[0].genre,
      duration_minutes: rows[0].duration_minutes,
      poster_url: rows[0].poster_url,
      showtimes: rows.map(row => ({
        showtimeId: row.showtimeId,
        show_time: row.show_time,
        theaterName: row.theaterName,
        capacity: row.capacity
      }))
    };
    res.status(200).json(movieDetails);
  });
});


// --- GET a Showtime with its Booked Seats ---
// Fetches details for a specific showtime, including a list of all seats that are already booked.
app.get('/api/showtimes/:id', (req, res) => {
    const showtimeId = req.params.id;

    const showtimeSql = `
        SELECT s.id as showtimeId, s.show_time, m.title as movieTitle, t.name as theaterName, t.capacity
        FROM Showtimes s
        JOIN Movies m ON s.movie_id = m.id
        JOIN Theaters t ON s.theater_id = t.id
        WHERE s.id = ?
    `;

    const bookingsSql = `SELECT seats_booked FROM Bookings WHERE showtime_id = ?`;

    // First, get the showtime details
    db.get(showtimeSql, [showtimeId], (err, showtimeDetails) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!showtimeDetails) {
            return res.status(404).json({ message: "Showtime not found." });
        }

        // Next, get all the bookings for this showtime
        db.all(bookingsSql, [showtimeId], (err, bookings) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Combine all booked seats into a single flat array
            const bookedSeats = bookings
                .map(booking => booking.seats_booked.split(',')) // 'A1,A2' -> ['A1', 'A2']
                .flat(); // [['A1','A2'], ['B3']] -> ['A1', 'A2', 'B3']
            
            res.status(200).json({
                ...showtimeDetails,
                bookedSeats: bookedSeats
            });
        });
    });
});


// --- POST a New Booking ---
// Creates a new booking in the database.
app.post('/api/bookings', (req, res) => {
  const { showtime_id, seats_booked } = req.body;

  // Basic validation
  if (!showtime_id || !seats_booked || seats_booked.length === 0) {
    return res.status(400).json({ message: 'Missing showtime_id or seats_booked.' });
  }

  // Convert seat array to a comma-separated string for storing in DB
  const seatsString = Array.isArray(seats_booked) ? seats_booked.join(',') : seats_booked;

  const sql = `INSERT INTO Bookings (showtime_id, seats_booked) VALUES (?, ?)`;
  const params = [showtime_id, seatsString];

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      message: 'Booking successful!',
      bookingId: this.lastID, // The ID of the row just inserted
      showtime_id: showtime_id,
      seats_booked: seats_booked
    });
  });
});


// =================================================================
//                      START THE SERVER
// =================================================================
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});