// React laddas som UMD från cdnjs i demon; den här modulen pekar på den globala.
const R = (window as unknown as { React: typeof import("react") }).React;
export default R;
export const { useState, useEffect, useRef, useMemo, useCallback, useId, Fragment } = R;
