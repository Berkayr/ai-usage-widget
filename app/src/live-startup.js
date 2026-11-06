export function startupFailure(error, snapshot) {
  return { snapshot, noData: !snapshot, message: `Unable to load quota data: ${error}` };
}
