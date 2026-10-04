/** Deloo holds church members' details: send errors only, no user info, cookies, bodies or query values. */
export const SENTRY_PRIVACY = {
  userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
  databaseQueryData: false, stackFrameVariables: false, genAI: { inputs: false, outputs: false },
};
