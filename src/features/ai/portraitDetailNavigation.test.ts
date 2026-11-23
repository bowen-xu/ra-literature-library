/** @vitest-environment happy-dom */
import {afterEach, expect, it, vi} from "vitest";
import {requestPortraitDetail, subscribePortraitDetail} from "./portraitDetailNavigation";
afterEach(()=>vi.useRealTimers());
it("opens only the matching paper after its production panel mounts",()=>{
 vi.useFakeTimers();const wrong=vi.fn(),right=vi.fn();
 const stop=subscribePortraitDetail("other",wrong);
 requestPortraitDetail("paper");vi.runAllTimers();expect(wrong).not.toHaveBeenCalled();
 const close=subscribePortraitDetail("paper",right);expect(right).toHaveBeenCalledOnce();
 const duplicate=vi.fn(),off=subscribePortraitDetail("paper",duplicate);expect(duplicate).not.toHaveBeenCalled();
 stop();close();off();
});
it("opens an already mounted panel and replaces an older pending navigation",()=>{
 vi.useFakeTimers();const open=vi.fn();const off=subscribePortraitDetail("new",open);
 requestPortraitDetail("old");requestPortraitDetail("new");vi.runAllTimers();expect(open).toHaveBeenCalledOnce();
 const stale=vi.fn(),stop=subscribePortraitDetail("old",stale);expect(stale).not.toHaveBeenCalled();off();stop();
});
