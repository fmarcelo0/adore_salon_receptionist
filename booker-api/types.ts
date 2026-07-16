// Shared types for the Booker client.
//
// Two groups live here: the *domain* shapes the rest of the app consumes (the
// clean objects our lookups/normalizers return), and the *result envelopes*
// Booker sends back from write calls. Raw Booker JSON is intentionally left as
// `any` at the fetch boundary — it's large and inconsistent — and narrowed into
// these shapes as early as possible so the app works with typed data.

// Booker IDs arrive as numbers but are often passed around as strings too.
export type Id = string | number

// --- Domain shapes (what the app consumes) -------------------------------

// A bookable service, as returned by findTreatments/searchTreatments.
export interface Treatment {
  treatmentId: number
  name: string
  price: number
  duration: number
}

// A treatment room and the treatment IDs it can host (drives room selection).
export interface Room {
  roomId: number
  name: string
  capacity: number
  treatments: number[]
}

// One open slot for a service on a day, from searchAvailability.
export interface AvailabilitySlot {
  startDateTime: string
  employeeId?: number
  serviceId?: number
  duration?: number
}

// A normalized customer record (see response-normalizers).
export interface Customer {
  customerId?: number
  firstName: string
  lastName: string
  phone: string
  email: string
}

// A normalized appointment, with the IDs needed to cancel/reschedule.
export interface Appointment {
  appointmentId: number
  customerId?: number
  treatmentId?: number
  employeeId?: number
  durationMin: number
  serviceName: string
  employeeName: string
  startDateTime: string
  status: string
}

// A caller looked up by phone: their identity plus their upcoming appointments.
export interface CallerRecord extends Customer {
  appointments: Appointment[]
}

// --- Booker result envelopes (what write calls return) -------------------

// The appointment object Booker echoes back on a successful write.
export interface BookerAppointment {
  ID: number
  [key: string]: unknown
}

// Common shape of Booker write responses. Not every field is always present;
// callers check IsSuccess and read ErrorMessage / Appointment as needed.
export interface BookerResult {
  IsSuccess: boolean
  ErrorMessage?: string | null
  ErrorCode?: number
  Appointment?: BookerAppointment | null
  ArgumentErrors?: Array<{ ArgumentName: string; ErrorMessage: string }> | null
}

// createCustomer additionally returns the new customer's ID.
export interface CreateCustomerResult extends BookerResult {
  CustomerID?: number
}
