// Restful-Booker API client.
//
// https://restful-booker.herokuapp.com  — a free, public, PERSISTENT practice
// API (a fake hotel-booking system). It is NOT the real salon Booker/Mindbody
// API — it's a live, writable sandbox we use to demonstrate real read/write
// against a database before the real Booker credentials arrive.
//
// Full CRUD: create / read / update / delete bookings.

const BASE_URL = process.env.RESTFUL_BOOKER_URL || 'https://restful-booker.herokuapp.com'
const USERNAME = process.env.RESTFUL_BOOKER_USER || 'admin'
const PASSWORD = process.env.RESTFUL_BOOKER_PASS || 'password123'

// --- Auth ----------------------------------------------------------------

// POST /auth -> token (needed for update/delete, not for create/read)
async function createToken() {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  })
  if (!res.ok) throw new Error(`auth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (!data.token) throw new Error(`auth returned no token: ${JSON.stringify(data)}`)
  return data.token
}

// --- Read ----------------------------------------------------------------

// GET /booking  (optionally filter by firstname/lastname/checkin/checkout)
// Returns an array of { bookingid }.
async function getBookingIds(filters = {}) {
  const params = new URLSearchParams(filters)
  const qs = params.toString() ? `?${params}` : ''
  const res = await fetch(`${BASE_URL}/booking${qs}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`getBookingIds failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// GET /booking/:id -> the full booking object
async function getBooking(id) {
  const res = await fetch(`${BASE_URL}/booking/${id}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`getBooking ${id} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Convenience: find a person's bookings by name, returning full objects.
async function findBookingsByName(firstname, lastname) {
  const ids = await getBookingIds({ firstname, lastname })
  return Promise.all(ids.map(({ bookingid }) => getBooking(bookingid)))
}

// --- Write ---------------------------------------------------------------

// POST /booking -> { bookingid, booking }  (no auth required)
async function createBooking(booking) {
  const res = await fetch(`${BASE_URL}/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(booking)
  })
  if (!res.ok) throw new Error(`createBooking failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// PUT /booking/:id -> updated booking (full replace; requires token)
async function updateBooking(id, booking, token) {
  const t = token || (await createToken())
  const res = await fetch(`${BASE_URL}/booking/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `token=${t}`
    },
    body: JSON.stringify(booking)
  })
  if (!res.ok) throw new Error(`updateBooking ${id} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// DELETE /booking/:id (requires token)
async function deleteBooking(id, token) {
  const t = token || (await createToken())
  const res = await fetch(`${BASE_URL}/booking/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: `token=${t}` }
  })
  if (!res.ok) throw new Error(`deleteBooking ${id} failed: ${res.status} ${await res.text()}`)
  return true
}

module.exports = {
  createToken,
  getBookingIds,
  getBooking,
  findBookingsByName,
  createBooking,
  updateBooking,
  deleteBooking,
  BASE_URL
}
