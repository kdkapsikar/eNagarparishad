# Paper forms → fields

The office's two printed forms ("नगरसेवक आपल्या दारी") map to the database as below. The scans themselves
are kept locally in `docs/sample-forms/` and are **not** committed (they carry personal photos and a
phone number).

## Form 1 - family sheet (कुटुंब प्रमुख) → `households`

| Paper form | Field | Notes |
| --- | --- | --- |
| कुटुंब प्रमुखाचे नाव | `head_name` | Also member 1 |
| मोबाईल क्र. | `mobile` | 10-digit Indian mobile; +91 / 0 / spaces / Marathi digits accepted |
| व्हॉट्सॲप क्र. | `whatsapp` | Preferred number for notices |
| पत्ता | `address` | |
| – | `area` | Added: वस्ती / गल्ली, used to send a notice to one area |
| जात | `caste` | Optional; the bot offers "Skip" |
| प्रवर्ग | `category` | open, obc, sc, st, vjnt, sbc, sebc, ews, other - optional |
| १. शेती असल्यास तपशील | `farm_details` | Bot asks "शेती आहे का?" first |
| २. अपंगत्व आहे का? | `disability` | Bot asks yes/no first |
| ३. इंटरनेट सुविधा होय/नाही | `has_internet` | |
| ४. वॉटर फिल्टर होय/नाही | `has_water_filter` | |
| ५. अंगणवाडी आहे का? होय/नाही | `has_anganwadi` | |
| ६. घरकुल योजनेचा लाभ होय/नाही | `gharkul_benefit` | |
| ७. इतर समस्या | `other_issues` | |
| – | `consent`, `consent_at` | Added: required for every family |

## Form 2 - members table (कुटुंबातील व्यक्तींची माहिती) → `members`

| Paper form | Field | Notes |
| --- | --- | --- |
| अनु. क्र. | `position` | |
| नाव | `name` | |
| जन्म तारीख | `dob` | Drives birthday wishes |
| लिंग | `gender` | male / female / other |
| शिक्षण | `education` | |
| व्यवसाय | `occupation` | |
| मोबाईल क्र. | `mobile` | Birthday wishes go here, else to the family number |
| आधार कार्ड क्र. | `aadhaar_last4` | **Only the last 4 digits are stored** |
| मतदान कार्ड क्र. | `voter_id` | EPIC number |
| – | `relation` | Added: नाते to the head of family |
| – | `anniversary` | Added for anniversary wishes (requirement 2) |
| – | `pan_enc`, `pan_last4` | Added for the PAN requirement; encrypted |
