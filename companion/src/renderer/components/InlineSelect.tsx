import { CustomSelect, type CustomSelectProps } from './CustomSelect';
import type { SelectValue } from './custom-select-types';

/**
 * A CustomSelect whose menu opens inline by default. The feature cards were
 * laid out for inline menus; pass `floatingMenu` to float one anyway.
 */
export function InlineSelect<T extends SelectValue>(props: CustomSelectProps<T>) {
  return <CustomSelect floatingMenu={false} {...props} />;
}
