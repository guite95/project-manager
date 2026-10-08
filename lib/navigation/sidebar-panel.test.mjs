import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../../components/erp/use-sidebar-panel.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// DOM 없이 실제 훅의 이벤트·타이머를 실행한다. 상태 갱신마다 다시 렌더하고 effect 정리도 수행한다.
function setup(initial = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = false;
  let result;
  const writes = [];
  const doc = { activeElement: null };
  const options = { collapsed: true, activeId: "work", routeKey: "/work", ...initial };
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => {
        if (!Object.is(slots[index], next)) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (slots[index]?.deps.every((value, i) => Object.is(value, deps[i]))) return;
      effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "document", "Node", source)(
    name => { assert.equal(name, "react"); return hooks; }, module, module.exports, doc, class {},
  );
  const render = () => {
    do {
      dirty = false;
      cursor = 0;
      result = module.exports.useSidebarPanel({ ...options, onCollapsedChange: value => {
        writes.push(value);
        options.collapsed = value;
      } });
      effects.splice(0).forEach(effect => effect());
    } while (dirty);
    return result;
  };
  render();
  return {
    get value() { return result; }, writes, doc,
    run(action) { action(result); return render(); },
    update(values) { Object.assign(options, values); return render(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const point = (x = 20, y = 30) => ({ clientX: x, clientY: y });

test("접힌 레일의 마우스·클릭·포커스는 임시 메뉴만 바꾸고 공유 설정을 저장하지 않는다", () => {
  const app = setup();
  assert.equal(app.value.peeking, false);
  app.run(value => value.railProps("records").onMouseEnter(point()));
  assert.equal(app.value.shownId, "records");
  assert.equal(app.value.peeking, true);
  app.run(value => value.railProps("work").onClick());
  assert.equal(app.value.shownId, "work");
  app.run(value => value.railProps("records").onFocus());
  assert.equal(app.value.shownId, "records");
  assert.deepEqual(app.writes, []);
  app.dispose();
});

test("사이드바 이탈 후 150ms에 닫고, 다시 들어오면 닫기를 취소한다", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const app = setup();
  app.run(value => value.railProps("work").onMouseEnter(point()));
  app.run(value => value.rootProps.onMouseLeave());
  app.run(() => context.mock.timers.tick(149));
  assert.equal(app.value.peeking, true);
  app.run(value => value.rootProps.onMouseEnter());
  app.run(() => context.mock.timers.tick(1000));
  assert.equal(app.value.peeking, true);
  app.run(value => value.rootProps.onMouseLeave());
  app.run(() => context.mock.timers.tick(150));
  assert.equal(app.value.peeking, false);
  app.dispose();
});

test("임시 메뉴를 펼쳐 고정하면 보던 영역을 유지하고 다음 경로 이동 때 현재 영역으로 돌아간다", () => {
  const app = setup();
  app.run(value => value.railProps("records").onMouseEnter(point()));
  app.run(value => value.togglePanel());
  assert.deepEqual(app.writes, [false]);
  assert.equal(app.value.peeking, false);
  assert.equal(app.value.shownId, "records");
  app.run(value => value.railProps("work").onMouseEnter(point()));
  assert.equal(app.value.shownId, "records");
  app.update({ routeKey: "/work/detail" });
  assert.equal(app.value.shownId, "work");
  app.update({ routeKey: "/work" });
  assert.equal(app.value.shownId, "work");
  app.dispose();
});

test("패널 안에서 Esc로 닫으면 해당 레일로 포커스를 돌리고 다시 열지 않는다", () => {
  const app = setup();
  const rail = { focus() { app.doc.activeElement = rail; app.value.railProps("records").onFocus(); } };
  app.run(value => {
    value.railProps("records").ref(rail);
    value.panelRef.current = { contains: element => element === "panel-link" };
    value.railProps("records").onFocus();
  });
  app.doc.activeElement = "panel-link";
  let prevented = false;
  app.run(value => value.rootProps.onKeyDown({ key: "Escape", preventDefault() { prevented = true; } }));
  assert.equal(prevented, true);
  assert.equal(app.value.peeking, false);
  assert.equal(app.doc.activeElement, rail);
  assert.deepEqual(app.writes, []);
  app.dispose();
});

test("키보드 포커스가 사이드바 밖으로 나가면 임시 메뉴를 닫는다", () => {
  const app = setup();
  app.run(value => value.railProps("records").onFocus());
  app.run(value => value.rootProps.onBlur({ relatedTarget: null }));
  assert.equal(app.value.peeking, false);
  app.dispose();
});

test("패널로 대각선 이동하며 스친 메뉴는 유지하고 그 위에 머무르면 전환한다", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const app = setup();
  app.run(value => {
    value.panelRef.current = { getBoundingClientRect: () => ({ left: 60, top: 0, bottom: 900 }) };
    value.railProps("work").onMouseEnter(point());
  });
  app.run(value => value.railProps("work").onMouseLeave(point(30, 50)));
  app.run(value => value.railProps("records").onMouseEnter(point(40, 80)));
  assert.equal(app.value.shownId, "work");
  app.run(() => context.mock.timers.tick(149));
  assert.equal(app.value.shownId, "work");
  app.run(() => context.mock.timers.tick(1));
  assert.equal(app.value.shownId, "records");
  app.dispose();
});

test("패널에 도착하면 스친 메뉴 전환을 취소하고, 레일을 따라 이동하면 즉시 바꾼다", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const app = setup();
  app.run(value => {
    value.panelRef.current = { getBoundingClientRect: () => ({ left: 60, top: 0, bottom: 900 }) };
    value.railProps("work").onMouseEnter(point());
  });
  app.run(value => value.railProps("work").onMouseLeave(point(30, 50)));
  app.run(value => value.railProps("records").onMouseEnter(point(40, 80)));
  app.run(value => value.railProps("records").onMouseLeave(point(61, 140)));
  app.run(() => context.mock.timers.tick(1000));
  assert.equal(app.value.shownId, "work");
  app.run(value => value.railProps("records").onMouseEnter(point(20, 150)));
  assert.equal(app.value.shownId, "records");
  app.dispose();
});

test("모바일 전환과 외부 접힘 설정 갱신은 임시 메뉴를 지우며 저장을 발생시키지 않는다", () => {
  const app = setup();
  app.run(value => value.railProps("records").onMouseEnter(point()));
  app.update({ enabled: false });
  app.run(value => value.railProps("records").onFocus());
  app.update({ enabled: true });
  assert.equal(app.value.peeking, false);
  app.run(value => value.railProps("records").onMouseEnter(point()));
  app.update({ collapsed: false });
  app.update({ collapsed: true });
  assert.equal(app.value.peeking, false);
  assert.deepEqual(app.writes, []);
  app.dispose();
});

test("언마운트 시 대기 중인 메뉴 전환과 닫기 타이머를 정리한다", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const app = setup();
  app.run(value => value.railProps("records").onFocus());
  app.run(value => value.rootProps.onMouseLeave());
  app.dispose();
  app.run(() => context.mock.timers.tick(1000));
  assert.equal(app.value.peeking, true);
});
