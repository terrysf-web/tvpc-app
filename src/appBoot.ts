/**
 * 앱 첫 그림 준비 신호 — 홈이 말씀·배경을 확정하면 알린다.
 * 브랜드 스플래시가 이 신호를 받고 사라진다. 신호가 안 오는 경우
 * (다른 화면으로 바로 들어옴, 통신 두절)를 대비해 스플래시 쪽에
 * 시간 상한이 따로 있다.
 */
const subs = new Set<() => void>();
let ready = false;

export function setAppReady() {
  if (ready) return;
  ready = true;
  subs.forEach((f) => f());
}

export function isAppReady(): boolean {
  return ready;
}

export function onAppReady(f: () => void): () => void {
  if (ready) {
    f();
    return () => {};
  }
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
