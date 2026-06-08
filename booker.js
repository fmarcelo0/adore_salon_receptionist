// Booker (Mindbody) API client.
//
// Reads credentials from environment variables. If any required credential is
// missing, isConfigured() returns false and the app falls back to mock data —
// so this file is safe to ship before Booker provides the Site ID / keys.
//
// Required env vars (set these in .env locally and in Render for production):
//   BOOKER_LOCATION_ID       the Site ID / LocationID Booker assigns
//   BOOKER_CLIENT_ID         OAuth client id
//   BOOKER_CLIENT_SECRET     OAuth client secret
//   BOOKER_SUBSCRIPTION_KEY  Ocp-Apim-Subscription-Key (Customer subscription key)
//
// Optional — only needed for Merchant API calls (FindCustomers):
//   BOOKER_MERCHANT_SUBSCRIPTION_KEY  Merchant subscription key
//   BOOKER_PERSONAL_ACCESS_TOKEN      Merchant PAT (already URL-decoded)
//   BOOKER_BRAND_ID                   only if the PAT is a brand-level user;
//                                     triggers the brand->location token exchange
//   BOOKER_MERCHANT_SCOPE             token scope, defaults to 'merchant'
// Optional:
//   BOOKER_BASE_URL          defaults to the staging host

const BASE_URL = process.env.BOOKER_BASE_URL || 'https://api-staging.booker.com'
const LOCATION_ID = process.env.BOOKER_LOCATION_ID
const CLIENT_ID = process.env.BOOKER_CLIENT_ID
const CLIENT_SECRET = process.env.BOOKER_CLIENT_SECRET
const SUBSCRIPTION_KEY = process.env.BOOKER_SUBSCRIPTION_KEY
const MERCHANT_SUBSCRIPTION_KEY = process.env.BOOKER_MERCHANT_SUBSCRIPTION_KEY
const PERSONAL_ACCESS_TOKEN = process.env.BOOKER_PERSONAL_ACCESS_TOKEN
const BRAND_ID = process.env.BOOKER_BRAND_ID
const MERCHANT_SCOPE = process.env.BOOKER_MERCHANT_SCOPE || 'merchant'

function isConfigured() {
  return Boolean(LOCATION_ID && CLIENT_ID && CLIENT_SECRET && SUBSCRIPTION_KEY)
}

// Merchant API (FindCustomers) needs the PAT flow + merchant subscription key.
function isMerchantConfigured() {
  return Boolean(
    LOCATION_ID && CLIENT_ID && CLIENT_SECRET &&
    MERCHANT_SUBSCRIPTION_KEY && PERSONAL_ACCESS_TOKEN
  )
}

// --- Auth token (cached until ~60s before expiry) ------------------------

let cachedToken = null
let tokenExpiresAt = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'customer'
  })

  const res = await fetch(`${BASE_URL}/v5/auth/connect/token`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!res.ok) {
    throw new Error(`Booker auth failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  // expires_in is in seconds; refresh 60s early
  tokenExpiresAt = Date.now() + ((data.expires_in || 1800) - 60) * 1000
  return cachedToken
}

function authedHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Content-Type': 'application/json'
  }
}

// --- Availability --------------------------------------------------------

// Returns an array of ISO date strings the location has availability on.
// GET /v5/realtime_availability/AvailableDates
async function getAvailableDates({ serviceId, fromDate, toDate } = {}) {
  const token = await getAccessToken()
  const now = new Date()
  const from = fromDate || now.toISOString()
  const to = toDate || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const params = new URLSearchParams({ locationIds: String(LOCATION_ID), fromDate: from, toDate: to })
  if (serviceId) params.append('serviceId', String(serviceId))

  const res = await fetch(`${BASE_URL}/v5/realtime_availability/AvailableDates?${params}`, {
    headers: authedHeaders(token)
  })
  if (!res.ok) throw new Error(`AvailableDates failed: ${res.status} ${await res.text()}`)

  const data = await res.json()
  return data.availability || []
}

// Time-block availability for a single day.
// GET /v5/realtime_availability/availability/1day
async function getDayAvailability({ fromDateTime, serviceId } = {}) {
  const token = await getAccessToken()
  const params = new URLSearchParams({
    LocationIds: String(LOCATION_ID),
    fromDateTime: fromDateTime || new Date().toISOString()
  })
  if (serviceId) params.append('serviceId[]', String(serviceId))

  const res = await fetch(`${BASE_URL}/v5/realtime_availability/availability/1day/?${params}`, {
    headers: authedHeaders(token)
  })
  if (!res.ok) throw new Error(`availability/1day failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// --- Appointments --------------------------------------------------------

// POST /v4.1/customer/appointments
// Pass a customerId, or a fromDate/toDate range.
async function findAppointments({ customerId, fromDate, toDate } = {}) {
  const token = await getAccessToken()
  const payload = { LocationID: Number(LOCATION_ID), access_token: token }
  if (customerId) payload.CustomerID = Number(customerId)
  if (fromDate) payload.FromStartDateOffset = fromDate
  if (toDate) payload.ToStartDateOffset = toDate

  const res = await fetch(`${BASE_URL}/v4.1/customer/appointments`, {
    method: 'POST',
    headers: authedHeaders(token),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`FindAppointments failed: ${res.status} ${await res.text()}`)

  const data = await res.json()
  return data.Results || []
}

// PUT /v4.1/customer/appointment/cancel
async function cancelAppointment({ appointmentId, cancellationReasonId } = {}) {
  const token = await getAccessToken()
  const payload = { ID: Number(appointmentId), access_token: token }
  if (cancellationReasonId) payload.CancellationReasonID = Number(cancellationReasonId)

  const res = await fetch(`${BASE_URL}/v4.1/customer/appointment/cancel`, {
    method: 'PUT',
    headers: authedHeaders(token),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`CancelAppointment failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// --- Merchant auth (Personal Access Token flow) --------------------------

let cachedMerchantToken = null
let merchantTokenExpiresAt = 0

async function getMerchantAccessToken() {
  if (cachedMerchantToken && Date.now() < merchantTokenExpiresAt) return cachedMerchantToken

  const body = new URLSearchParams({
    grant_type: 'personal_access_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: MERCHANT_SCOPE,
    personal_access_token: PERSONAL_ACCESS_TOKEN
  })

  const res = await fetch(`${BASE_URL}/v5/auth/connect/token`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': MERCHANT_SUBSCRIPTION_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
  if (!res.ok) throw new Error(`Booker merchant auth failed: ${res.status} ${await res.text()}`)

  const data = await res.json()
  let token = data.access_token

  // If the PAT is a brand-level user, exchange the brand token for a
  // location-level token. Location-level PATs skip this (no BRAND_ID set).
  if (BRAND_ID) token = await exchangeForLocationToken(token)

  cachedMerchantToken = token
  merchantTokenExpiresAt = Date.now() + ((data.expires_in || 1800) - 60) * 1000
  return cachedMerchantToken
}

// Authentication > PostUpdate: brand-level token -> location-level token.
// POST /v5/auth/context/update?locationId=...&brandId=...
async function exchangeForLocationToken(brandToken) {
  const params = new URLSearchParams({ locationId: String(LOCATION_ID), brandId: String(BRAND_ID) })
  const res = await fetch(`${BASE_URL}/v5/auth/context/update?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${brandToken}`,
      'Ocp-Apim-Subscription-Key': MERCHANT_SUBSCRIPTION_KEY
    }
  })
  if (!res.ok) throw new Error(`Brand->location token exchange failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.access_token || brandToken
}

function merchantHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': MERCHANT_SUBSCRIPTION_KEY,
    'Content-Type': 'application/json'
  }
}

// --- FindCustomers (Merchant API) ----------------------------------------
//
// NOTE: the exact request/response field names for FindCustomers were not in
// the API docs provided. The path and body below follow Booker's v4.1 merchant
// conventions and MUST be verified against the portal's FindCustomers operation
// (the response mapping tolerates the common field-name variants).
const FIND_CUSTOMERS_PATH = process.env.BOOKER_FIND_CUSTOMERS_PATH || '/v4.1/merchant/customers'

async function findCustomers({ phone, firstName, lastName, email } = {}) {
  const token = await getMerchantAccessToken()
  const payload = {
    access_token: token,
    LocationID: Number(LOCATION_ID),
    UsePaging: true,
    PageSize: 10,
    PageNumber: 0
  }
  // Booker's filter field names vary by deployment — send the likely ones.
  if (phone) payload.CustomerPhone = phone
  if (firstName) payload.FirstName = firstName
  if (lastName) payload.LastName = lastName
  if (email) payload.Email = email

  const res = await fetch(`${BASE_URL}${FIND_CUSTOMERS_PATH}`, {
    method: 'POST',
    headers: merchantHeaders(token),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`FindCustomers failed: ${res.status} ${await res.text()}`)

  const data = await res.json()
  return data.Results || data.Customers || []
}

// Normalize a raw Booker customer object into the shape index.js expects.
function normalizeCustomer(raw) {
  return {
    customerId: raw.ID ?? raw.CustomerID,
    firstName: raw.FirstName || '',
    lastName: raw.LastName || '',
    phone: raw.CellPhone || raw.MobilePhone || raw.HomePhone || raw.Phone || '',
    email: raw.Email || ''
  }
}

// Normalize a raw Booker appointment (from FindAppointments) into our shape.
function normalizeAppointment(raw) {
  const treatment = raw.AppointmentTreatments && raw.AppointmentTreatments[0]
  return {
    appointmentId: raw.ID,
    serviceName: treatment?.Treatment?.Name || raw.Treatment?.Name || 'Appointment',
    employeeName: treatment?.Employee?.FirstName || '',
    startDateTime: raw.StartDateTimeOffset || raw.StartDateTime,
    status: raw.Status?.Name || (raw.IsCancelled ? 'Cancelled' : 'Booked')
  }
}

// Full caller lookup: phone -> customer -> their appointments.
// Returns the same shape as a mock customer record, or null if not found.
async function lookupCustomerByPhone(phone) {
  const matches = await findCustomers({ phone })
  if (!matches.length) return null

  const customer = normalizeCustomer(matches[0])
  let appointments = []
  if (customer.customerId) {
    try {
      const raw = await findAppointments({ customerId: customer.customerId })
      appointments = raw.map(normalizeAppointment)
    } catch (err) {
      console.error('FindAppointments after FindCustomers failed:', err.message)
    }
  }
  return { ...customer, appointments }
}

module.exports = {
  isConfigured,
  isMerchantConfigured,
  getAccessToken,
  getMerchantAccessToken,
  getAvailableDates,
  getDayAvailability,
  findAppointments,
  cancelAppointment,
  findCustomers,
  lookupCustomerByPhone,
  LOCATION_ID
}
