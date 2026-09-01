const ONE_MB = 1024 * 1024;

/** The multer limit and the error message both read this, so they cannot disagree. */
export const MAX_AVATAR_BYTES = 5 * ONE_MB;

/** Derived, never written by hand — changing the limit rewrites the message. */
export const MAX_AVATAR_LABEL = `${MAX_AVATAR_BYTES / ONE_MB}MB`;
