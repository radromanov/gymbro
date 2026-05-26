// 1. POST Login: https://api.octivfitness.com/api/login
// 2. GET Me (needed to get `id` or `userId`, 200 on success): https://api.octivfitness.com/api/users/me
//      * Authorization: Bearer {{ accessToken }}
//      * Accept: application/json, text/plain, */*
//      * Accept-Encoding: gzip, deflate, br, zstd
//      * Accept-Language: en-US,en;q=0.9
//      * User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36
//      * X-Camelcase: true
//      * Bypass-Tunnel-Reminder: *
//      * Origin: https://app.octivfitness.com/
//      * Sec-Ch-Ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"
//      * Sec-Ch-Ua-Mobile: ?0
//      * Sec-Ch-Platform: "Windows"
//      * Sec-Fetch-Dest: empty
//      * Sec-Fetch-Mode: cors
//      * Sec-Fetch-Site: same-site
// 3. Actions:
//  - GET Schedule 1 day (27/05, 200 on success): https://api.octivfitness.com/api/class-dates?include=classBookings,classBookingWaitingList&filter[tenantId]=102880&filter[locationId]=2741&filter[between]=2026-05-27,2026-05-27&filter[isSession]=1&internalAppend=withoutLocations&perPage=-1
//      * Authorization: Bearer {{ accessToken }}
//      * Accept: application/json, text/plain, */*
//      * Accept-Encoding: gzip, deflate, br, zstd
//      * Accept-Language: en-US,en;q=0.9
//      * User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36
//      * X-Camelcase: true
//      * Bypass-Tunnel-Reminder: *
//      * Origin: https://app.octivfitness.com/
//      * Sec-Ch-Ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"
//      * Sec-Ch-Ua-Mobile: ?0
//      * Sec-Ch-Platform: "Windows"
//      * Sec-Fetch-Dest: empty
//      * Sec-Fetch-Mode: cors
//      * Sec-Fetch-Site: same-site
//  - POST Book Session (201 on success): https://api.octivfitness.com/api/class-bookings
//      * Authorization: Bearer {{ accessToken }}
//      * Accept: application/json, text/plain, */*
//      * Accept-Encoding: gzip, deflate, br, zstd
//      * Accept-Language: en-US,en;q=0.9
//      * Bypass-Tunnel-Reminder: *
//      * Origin: https://app.octivfitness.com/
//      * Sec-Ch-Ua: "Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"
//      * Sec-Ch-Ua-Mobile: ?0
//      * Sec-Ch-Platform: "Windows"
//      * Sec-Fetch-Dest: empty
//      * Sec-Fetch-Mode: cors
//      * Sec-Fetch-Site: same-site
//      * Content-Length: 40

export const book = async () => {};
