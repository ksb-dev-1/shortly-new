const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * The shareable form of a short code.
 *
 * Built from the API origin rather than the frontend's, because the redirect
 * route lives on the backend — GET /:code, mounted at its root. In production
 * this is where a dedicated short domain would go instead; the two only look
 * interchangeable today because both are localhost.
 */
export function shortUrl(code: string) {
  return `${API_URL}/${code}`;
}

type ApiErrorBody = {
  message?: string;
  errors?: {
    errors?: string[];
    properties?: Record<string, { errors?: string[] } | undefined>;
  };
};

/**
 * Backend errors arrive in two different shapes: a deliberate ApiError sends
 * { message }, but a failed schema parse sends { errors } built by
 * z.treeifyError — with no message field at all. Reading only .message turns
 * every validation failure into "Something went wrong", so pull the first
 * readable line out of whichever shape arrived.
 */
export function errorMessage(data: unknown, fallback = "Something went wrong") {
  const body = data as ApiErrorBody | null;

  if (body?.message) {
    return body.message;
  }

  const tree = body?.errors;

  if (tree) {
    // A field-level issue ("Password must contain...") is more useful than a
    // form-level one, so prefer it.
    const fieldIssue = Object.values(tree.properties ?? {})
      .flatMap((property) => property?.errors ?? [])
      .at(0);

    return fieldIssue ?? tree.errors?.at(0) ?? fallback;
  }

  return fallback;
}
