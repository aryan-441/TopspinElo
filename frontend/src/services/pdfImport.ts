export const MAX_PDF_IMPORT_BYTES = 20 * 1024 * 1024;

export async function validatePdfImport(file: File): Promise<void> {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
    throw new Error('AI import accepts PDF files only (maximum 20 MB).');
  }
  if (!file.size || file.size > MAX_PDF_IMPORT_BYTES) {
    throw new Error('Choose a PDF smaller than 20 MB.');
  }
  const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== '%PDF-') throw new Error('This file is not a valid PDF. Choose a PDF smaller than 20 MB.');
}

export async function recognisePdf(file: File, endpoint: string, signal?: AbortSignal): Promise<Record<string, any>> {
  await validatePdfImport(file);
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('The PDF recognition service is unavailable. Please try again when it is running.');
  }
  const source = await response.text();
  let result: Record<string, any> | null = null;
  try { result = source ? JSON.parse(source) : null; } catch { /* An upstream service may return an HTML error page. */ }
  if (!response.ok) throw new Error(typeof result?.detail === 'string' ? result.detail : 'The PDF recognition service is unavailable. Please try again when it is running.');
  if (!result) throw new Error('The PDF recognition service returned an empty response. Please try again.');
  return result;
}
