import { navigate } from "./router";

export function useRouter() {
  return { push: navigate, replace: navigate, refresh() {}, back() {} };
}
export function notFound(): never {
  throw new Error("not found");
}
