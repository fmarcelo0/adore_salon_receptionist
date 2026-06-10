// Live demo: write salon appointments to the restful-booker database and read
// them back. Run with:  node demo.js
//
// Proves real read/write against a live API (not mock data). Cleans up after
// itself so it can be run repeatedly.

const rb = require('./restfulBooker')

// A couple of our salon customers, mapped onto the booking shape.
// (firstname/lastname = customer, checkin = appointment day, additionalneeds = service)
const APPOINTMENTS = [
  {
    firstname: 'Maria', lastname: 'Gonzalez',
    totalprice: 35, depositpaid: true,
    bookingdates: { checkin: '2026-06-12', checkout: '2026-06-12' },
    additionalneeds: 'Gel Manicure'
  },
  {
    firstname: 'James', lastname: 'Carter',
    totalprice: 105, depositpaid: false,
    bookingdates: { checkin: '2026-06-13', checkout: '2026-06-13' },
    additionalneeds: 'Deep Tissue Massage'
  }
]

async function main() {
  console.log('Using database:', rb.BASE_URL, '\n')

  // 1. WRITE — create each appointment, remember the ids so we can clean up.
  const created = []
  for (const appt of APPOINTMENTS) {
    const res = await rb.createBooking(appt)
    created.push(res.bookingid)
    console.log(`WROTE  #${res.bookingid}  ${appt.firstname} ${appt.lastname} — ${appt.additionalneeds}`)
  }

  // 2. READ — look one up by name, straight from the database.
  console.log('\nREAD back by name "Maria Gonzalez":')
  const found = await rb.findBookingsByName('Maria', 'Gonzalez')
  console.log(JSON.stringify(found, null, 2))

  // 3. UPDATE — change Maria's service, then read it again.
  const token = await rb.createToken()
  const updated = { ...APPOINTMENTS[0], additionalneeds: 'Gel Manicure + Pedicure', totalprice: 90 }
  await rb.updateBooking(created[0], updated, token)
  console.log(`\nUPDATED #${created[0]} ->`, (await rb.getBooking(created[0])).additionalneeds)

  // 4. DELETE — clean up the demo rows so we don't litter the database.
  for (const id of created) {
    await rb.deleteBooking(id, token)
    console.log(`DELETED #${id}`)
  }

  console.log('\nDone — wrote, read, updated, and cleaned up. All live.')
}

main().catch(err => {
  console.error('Demo failed:', err.message)
  process.exit(1)
})
