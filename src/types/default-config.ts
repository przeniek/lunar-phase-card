import { PageType } from '../const';
import { LunarPhaseCardConfig } from './config';

export const defaultConfig: Partial<LunarPhaseCardConfig> = {
  type: 'custom:lunar-phase-card',
  entity: '',
  '12hr_format': false,
  calendar_modal: false,
  compact_view: false,
  default_card: PageType.BASE,
  hide_buttons: false,
  mile_unit: false,
  moon_position: 'left',
  number_decimals: 2,
  selected_language: 'system',
  show_background: true,
  southern_hemisphere: false,
  use_custom: false,
  use_default: true,
  use_entity: false,
  graph_config: {
    graph_type: 'default',
    y_ticks: false,
    x_ticks: false,
    show_time: true,
    show_current: true,
    show_highest: true,
    y_ticks_position: 'left',
    y_ticks_step_size: 30,
    time_step_size: 30,
  },
  font_customize: {
    header_font_size: 'x-large',
    header_font_style: 'capitalize',
    header_font_color: '',
    label_font_size: 'auto',
    label_font_style: 'none',
    label_font_color: '',
    hide_label: false,
  },
};
