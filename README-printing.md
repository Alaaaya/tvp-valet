# Booking print sheets

The PDF copies the owner's approved one-page A4 vector template from
`public/print/booking-template.pdf`. Static artwork, wording and contact details
are not redrawn or masked. Dynamic values are overlaid in the original artboard
coordinates. Bundled Liberation Sans fonts retain German accents; their license
is included alongside the template.

The sidebar action prints each non-cancelled booking whose scheduled arrival
or departure falls on the selected Europe/Berlin calendar day, once per booking
ID. Search, direction and completed-event filters do not narrow this export.
The label includes the selected date and unique booking count. Detail print
exports only the displayed booking.

The booking's authoritative `total` and `paid` values are used. Legacy key-cash
notes are not added again. Gross total is split into net plus 19% VAT using
integer cents; due is clamped to zero for overpayment. No payment method or
extra-service price is inferred from prose. Those template fields stay blank
when no authoritative structured value exists.

Vehicle brand/model/color are only populated from explicitly imported vehicle
fields. Missing fields remain blank; parking descriptions are not brands.
Customer remarks are deduplicated with the existing imported-note display helper.
Driver trips, damage checkboxes, handover and signature boxes remain available
for completion on paper. Each booking code is also encoded in a QR.

Each booking produces exactly one A4 page. Long values wrap and shrink within
their field; values that cannot fit raise a visible error instead of silently
truncating data or creating a second page.

PDF libraries and assets are loaded only after pressing print. Desktop saves a
PDF; compatible touch browsers offer native sharing, including print/save.
If async preparation expires iOS user activation, a second explicit
`PDF öffnen` tap opens the share sheet. Cancelling sharing does not download an
unwanted file. No browser popup is required. Physical iPhone/printer output
requires device verification; browser emulation is not a device test.
