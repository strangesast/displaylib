//var net = require('net');
//var MSG_NONE = 0;

var MessageType = Object.freeze ({MSG_NONE:0, MSG_RECT:101, MSG_TEXTBOX:110, MSG_TIMER:111, MSG_TEXT:150, MSG_PANELDEF:151,
                                 MSG_GENERIC_CMD:160, MSG_TEXTBOX_CMD:161, MSG_TIMER_CMD:162, MSG_DISPLAY_CMD:163});
var ObjectCategory = Object.freeze ({OC_UNSPECIFIED:0, OC_CONTROL:1, OC_SHAPE:2, OC_DATA:3, OC_COMMAND:4});
var ProtocolCode = Object.freeze (
{MSG_END:0x01,MSG_START:0x02,START_ARRAY:0x03,END_ARRAY:0x04,START_TEXT:0x05,END_ELEMENT:0x06,
START_NUMBER_POS:0x07,START_NUMBER_NEG:0x08,FIRST_LEGAL_CHAR:0x09,MAGIC_NUMBER:0x87});
var DisplayAttribute = Object.freeze ({DA_NONE:0,DA_NORMAL:1,DA_HIDDEN:2,DA_FLASHING:3,DA_TBD_1:10});
var GenericScope = Object.freeze ({GS_NONE:-1,GS_APPLIES_TO_ALL:-2});

var TimerDisplayMode = Object.freeze ({DM_NONE:0, DM_HHMMSS:1, DM_MMSS:2});
var TimerPrecision = Object.freeze ({TP_NONE:0, TP_SECONDS:1, TP_TENTHS:2, TP_HUNDREDTHS:3});



var XYInfo = function (a_x, a_y, a_x_size, a_y_size) {
    if (a_x === undefined) {
        this.x = 0;
        this.y = 0;
    }
    else {
        this.x = a_x;
        this.y = a_y;
    }
    if (a_x_size === undefined) {
        a_x_size = 0;
        a_y_size = 0;
    }
    else {
        this.x_size = a_x_size;
        this.y_size = a_y_size;
    }
    this.Clear = function () {
        this.x = 0;
        this.y = 0;
        this.x_size = 0;
        this.y_size = 0;
    };
};

var DLColor = function (a_value) {
    if (a_value === undefined) {
        this.value = -1;
    }
    else {
        this.value = a_value;
    }
    this.value_rgbhex = "";
    this.SetValueHex = function (hex_value) {
        //convert to integer
        if (hex_value) {
            this.value = parseInt (hex_value, 16);
        }
        else {
            this.value = -1;
        }
    };
    this.red = function () {
        return (this.value >> 16) & 0xff;
    };
    this.green = function () {
        return (this.value >> 8) & 0xff;
    };
    this.blue = function () {
        return this.value & 0xff;
    };
    this.RGB = function (a_red, a_green, a_blue, a_intensity) {
        intensity = 100;
        if (a_intensity !== undefined && a_intensity > 0 && a_intensity < 100) {
            intensity = a_intensity;
        }
        this.value = (intensity << 24) + ((a_red & 0xff)<< 16) + ((a_green & 0xff) << 8) + (a_blue & 0xff);
//        this.value = 0x7f000000 + ((a_red & 0xff)<< 16) + ((a_green & 0xff) << 8) + (a_blue & 0xff);
    };
    this.get_intensity = function () {
        intensity = (this.value & 0x7f000000) >> 24;
        if (intensity > 100 || intensity < 0) {
            intensity = 100;
        }
        return intensity;
    };
    this.set_intensity = function(a_intensity) {
        if (a_intensity < 0 || a_intensity > 100) {
            a_intensity = 100;
        }
        this.value = (this.value & 0x00ffffff) | (a_intensity << 24);
    };
    this.setEmpty = function () {
        this.value = -1;
    };
    this.isEmpty = function () {
        return (this.value & 0xff000000 == 0xff000000);
    };
    this.getValue = function () {
        return this.value;
    };
    this.getRGB = function (scaling) {
        var intensity = this.get_intensity();
        var distance_to_100 = 100 - intensity;
        var factor = 100 - Math.floor(distance_to_100/scaling);
        var return_value = 0;
        return_value = (Math.floor((this.red()*factor)/100) <<16) + (Math.floor((this.green()*factor)/100) << 8) + (Math.floor((this.blue()*factor)/100));
        return return_value;
    };
    this.getRGBHex = function (scaling) {
        var color_rgb = this.getRGB(scaling);
        var color_hex = color_rgb.toString(16);
        while (color_hex.length < 6) { color_hex = '0' + color_hex; }
        return "#"+ color_hex;
    };
    this.setRGBHex = function (hex_rgb_value) {
        //convert to integer
        this.value = 0;
        if (!hex_rgb_value) {
            return;
        }
        if (hex_rgb_value[0] == '#') {
            hex_rgb_value = hex_rgb_value.substring (1);
        }
        hex_rgb_value = '0x' + hex_rgb_value;
        var converted = parseInt (hex_rgb_value, 16);
        this.value = (100<<24) + (converted & 0xffffff);
        console.log ("setRGBHex: " + converted + "value: " + this.value);
    };
};


var DLBase = function () {
    this.type = MessageType.MSG_NONE;
    this.category = ObjectCategory.OC_UNSPECIFIED;
    this.layer = 0;
    this.panel = 0;
    this.control = 0;
    this.parent_control = 0;
    this.is_final = 0;
    this.display_attribute = DisplayAttribute.DA_NONE;
    this.color = DLColor(0);
};

DLBase.prototype.EncodeInt = function (value, encoded_buffer, pos) {
//        var encoded_buffer = new Buffer(100);
    if (value<0) {
        value = -value;
        encoded_buffer[pos] = ProtocolCode.START_NUMBER_NEG;
    }else {
        encoded_buffer[pos] = ProtocolCode.START_NUMBER_POS;
    }
    pos++;
    //send LS nibble until value is empty
    while (value > 0) {
        encoded_buffer[pos] = 0x30 + (value & 0x0f);
        pos++;
        value = value >> 4;
    }
    encoded_buffer[pos] = ProtocolCode.END_ELEMENT;
    pos++;
    return pos;
};
DLBase.prototype.EncodeString = function (string_value, encoded_buffer, pos) {
//    console.log ("text: " + string_value + "length: " + string_value.length);
    encoded_buffer[pos] = ProtocolCode.START_TEXT;
    pos++;
    for (i=0; i<string_value.length; i++) {
        //skip illegal characters
        if (string_value.charCodeAt(i) < ProtocolCode.FIRST_LEGAL_CHAR) {
            continue;
        }
        encoded_buffer[pos] = string_value.charCodeAt(i);
//        console.log ("pos: " + i + " = " + string_value.charCodeAt(i));
        pos++;
    }
    encoded_buffer[pos] = ProtocolCode.END_ELEMENT;
    pos++;
    return pos;
};

DLBase.prototype.DecodeInt = function (encoded_buffer, pos) {
    var is_negative = false;
    if (encoded_buffer[pos] == ProtocolCode.START_NUMBER_POS) {
        //code
    }
    else if (encoded_buffer[pos] == ProtocolCode.START_NUMBER_NEG) {
        is_negative = true;
    }
    else {
        return {
            result_int:0,
            result_pos:0
        };
    }
};

DLBase.prototype.DecodeString = function (encoded_buffer, pos) {
    if (encoded_buffer[pos] != ProtocolCode.START_TEXT) {
        return 0;
    }
    var return_string;
    for (i=0; ;i++) {
        if (encoded_buffer[pos] == ProtocolCode.END_ELEMENT) {
            pos++;  //accept the delimiter
            break;
        }
        //check for unexpected control character
        else if (encoded_buffer[pos] < ProtocolCode.FIRST_LEGAL_CHAR) {
            break;
        }
        return_string = return_string + encoded_buffer[pos];
        pos++;
    }
    return {
        result_str:return_string,
        result_pos:pos
    };
};


DLBase.prototype.BuildMessageContents = function (buffer, pos) {
    return pos;
};

DLBase.prototype.BuildMessage = function () {
    var msg_buffer = new Buffer(2000);
    var pos = 0;

    //build the header
    msg_buffer[pos] = ProtocolCode.MSG_START;
    pos++;
   //magic number
    msg_buffer[pos] = ProtocolCode.MAGIC_NUMBER;
    pos++;
    pos = this.EncodeInt (this.type, msg_buffer, pos);

    //write the common values
    pos = this.EncodeInt (this.layer, msg_buffer, pos);
    pos = this.EncodeInt (this.panel, msg_buffer, pos);
    pos = this.EncodeInt (this.control, msg_buffer, pos);
    pos = this.EncodeInt (this.parent_control, msg_buffer, pos);
    pos = this.EncodeInt (this.is_final, msg_buffer, pos);
    pos = this.EncodeInt (this.display_attribute, msg_buffer, pos);
    pos = this.BuildMessageContents (msg_buffer, pos);
    msg_buffer[pos] = ProtocolCode.MSG_END;
    pos++;
    return {
        result_buffer: msg_buffer,
        result_bytes: pos
    };
};

//var MSG_RECT = 101;

function DLRect () {
    DLBase.call(this);
    this.type = MessageType.MSG_RECT;
    this.xy = new XYInfo;
    this.line_color = new DLColor;
    this.fill_color = new DLColor;
    this.line_width = 1;
}

DLRect.prototype = Object.create(DLBase.prototype);
DLRect.prototype.constructor = DLRect;
//override BuildMessageContents
DLRect.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.xy.x, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.line_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.fill_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.line_width, msg_buffer, pos);
    return pos;
}

DLTextbox.prototype.InitFromJson = function (json, parent_id) {
    this.control_name = json.control_name;
    this.layer = json.layer;
    this.control = json.control_id;
    if (parent_id === undefined)
        this.parent_control = -1;
    else
        this.parent_control = parent_id;
    this.xy = new XYInfo (json.xy.x, json.xy.y, json.xy.x_size, json.xy.y_size);
    this.line_color.SetValueHex (json.border_color.value_hex);
    this.fill_color.SetValueHex (json.bg_color.value_hex);
    this.line_width = json.border_width;
};

//var MSG_TEXTBOX = 110;

function DLTextbox () {
    DLBase.call(this);
    this.type = MessageType.MSG_TEXTBOX;
    this.xy = new XYInfo;
    this.fg_color = new DLColor;
    this.bg_color = new DLColor;
    this.border_color = new DLColor;
    this.border_width = 1;
    this.text_xy = new XYInfo;
    this.char_buffer_size = 200;
    this.preferred_font = "";
}

DLTextbox.prototype = Object.create(DLBase.prototype);
DLTextbox.prototype.constructor = DLTextbox;
//override BuildMessageContents
DLTextbox.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.xy.x, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.fg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.bg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.border_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.border_width, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.x, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.y, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.char_buffer_size, msg_buffer, pos);
    pos = this.EncodeString (this.preferred_font, msg_buffer, pos);
    return pos;
};

DLTextbox.prototype.InitFromJson = function (json, parent_id) {
    this.layer = json.layer;
    this.control = json.control_id;
    if (parent_id === undefined)
        this.parent_control = -1;
    else
        this.parent_control = parent_id;
    this.control_name = json.control_name;
    this.xy = new XYInfo (json.xy.x, json.xy.y, json.xy.x_size, json.xy.y_size);
    this.fg_color.SetValueHex (json.fg_color.value_hex);
    this.bg_color.SetValueHex (json.bg_color.value_hex);
    this.border_color.SetValueHex (json.border_color.value_hex);
    this.border_width = json.border_width;
    if (json.xy_text === undefined) {
        this.text_xy = new XYInfo();
    }
    else {
        this.text_xy = new XYInfo (json.xy_text.x, json.xy_text.y, json.xy_text.x_size, json.xy_text.y_size);
    }
    this.preferred_font = json.preferred_font;
};


function DLTimer () {
    DLBase.call(this);
    this.type = MessageType.MSG_TIMER;
    this.xy = new XYInfo;
    this.fg_color = new DLColor;
    this.bg_color = new DLColor;
    this.border_color = new DLColor;
    this.border_width = 1;
    this.text_xy = new XYInfo;
    this.char_buffer_size = 200;
    this.preferred_font = "";
}

DLTimer.prototype = Object.create(DLBase.prototype);
DLTimer.prototype.constructor = DLTimer;
//override BuildMessageContents
DLTimer.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.xy.x, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.xy.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.fg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.bg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.border_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.border_width, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.x, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.y, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.text_xy.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.char_buffer_size, msg_buffer, pos);
    pos = this.EncodeString (this.preferred_font, msg_buffer, pos);
    return pos;
};

DLTimer.prototype.InitFromJson = function (json, parent_id) {
    this.layer = json.layer;
    this.control = json.control_id;
    if (parent_id === undefined)
        this.parent_control = -1;
    else
        this.parent_control = parent_id;
    this.control_name = json.control_name;
    this.xy = new XYInfo (json.xy.x, json.xy.y, json.xy.x_size, json.xy.y_size);
    this.fg_color.SetValueHex (json.fg_color.value_hex);
    this.bg_color.SetValueHex (json.bg_color.value_hex);
    this.border_color.SetValueHex (json.border_color.value_hex);
    this.border_width = json.border_width;
    if (json.xy_text === undefined) {
        this.text_xy = new XYInfo();
    }
    else {
        this.text_xy = new XYInfo (json.xy_text.x, json.xy_text.y, json.xy_text.x_size, json.xy_text.y_size);
    }
    this.preferred_font = json.preferred_font;
};



//var MSG_TEXTBOX_CMD = 161;
var ScrollCommand = Object.freeze ({SCROLL_NONE:-1, SCROLL_AUTO_BY_LINE:0, SCROLL_AUTO_BY_PAGE:1, SCROLL_MANUAL:2,
		SCROLL_PAUSE:10, SCROLL_RESUME:11, SCROLL_UP:12, SCROLL_DOWN:13,
		SCROLL_TO_TOP:14, SCROLL_TO_BOTTOM:15, SCROLL_TO_POSITION:16});
var ScrollOrientation = Object.freeze ({SO_NONE:-1, SO_NOSCROLL:1, SO_SCROLL_H:2, SO_SCROLL_V:3});
var ScrollEffect = Object.freeze ({SE_NONE:-1, SE_NORMAL:0, SE_SPORTSYNC:1,
		SE_DIVIDER_BETWEEN_POSTS:2});
var MessageCommand = Object.freeze ({MESSAGE_NONE:-1, MESSAGE_SELECT:0,
		MESSAGE_CYCLE_OFF:1, MESSAGE_CYCLE_ON:2, MESSAGE_CYCLE_PAUSE:3, MESSAGE_CYCLE_RESUME:4,
		MESSAGE_NEXT:5, MESSAGE_PREV:6, MESSAGE_FIRST:7, MESSAGE_LAST:8,
		MESSAGE_CREATE:10, MESSAGE_DELETE:11,
		MESSAGE_CYCLE_RATE:20, MESSAGE_POSTS_MAX:21});

function DLTextboxCmd () {
    DLBase.call(this);
    this.type = MessageType.MSG_TEXTBOX_CMD;
    this.command = MessageCommand.MESSAGE_NONE;
//    this.scope = S_PARTICULAR_CONTROL;
    this.selected_message = -1;
    this.scroll_param = -1;
    this.scroll_rate = -1;
    this.scroll_effect = ScrollEffect.SE_NONE;
    this.scroll_command = ScrollCommand.SCROLL_NONE;
    this.scroll_orientation = ScrollOrientation.SO_NONE;
    this.message_command = MessageCommand.MESSAGE_NONE;
    this.message_param = -1;
}

DLTextboxCmd.prototype = Object.create(DLBase.prototype);
DLTextboxCmd.prototype.constructor = DLTextboxCmd;
//override BuildMessageContents
DLTextboxCmd.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.selected_message, msg_buffer, pos);
    pos = this.EncodeInt (this.scroll_param, msg_buffer, pos);
    pos = this.EncodeInt (this.scroll_rate, msg_buffer, pos);
    pos = this.EncodeInt (this.scroll_effect, msg_buffer, pos);
    pos = this.EncodeInt (this.scroll_command, msg_buffer, pos);
    pos = this.EncodeInt (this.scroll_orientation, msg_buffer, pos);
    pos = this.EncodeInt (this.message_command, msg_buffer, pos);
    pos = this.EncodeInt (this.message_param, msg_buffer, pos);
    return pos;
};

//var MSG_TEXT = 150;
var TextAction = Object.freeze ({TEXT_NOACTION:0, TEXT_APPEND:1, TEXT_REPLACE:2, TEXT_CLEAR:3});
var TextFlag = Object.freeze ({TF_NONE:0, TF_LINEBREAK:1, TF_MSGEND:2});

function DLText () {
    DLBase.call(this);
    this.type = MessageType.MSG_TEXT;
    this.fg_color = new DLColor;
    this.bg_color = new DLColor;
    this.position = 0;
    this.text = "";
    this.message = 0;
    this.text_action = TextAction.TEXT_NOACTION;
    this.text_spacing = -1;
    this.text_flag = TextFlag.TF_NONE;
    this.preferred_font = "";
}

DLText.prototype = Object.create(DLBase.prototype);
DLText.prototype.constructor = DLText;
//override BuildMessageContents
DLText.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.fg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.bg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.position, msg_buffer, pos);
    pos = this.EncodeInt (this.message, msg_buffer, pos);
    pos = this.EncodeInt (this.text_action, msg_buffer, pos);
    pos = this.EncodeInt (this.text_flag, msg_buffer, pos);
    pos = this.EncodeInt (this.text_spacing, msg_buffer, pos);
    pos = this.EncodeString (this.preferred_font, msg_buffer, pos);
    pos = this.EncodeString (this.text, msg_buffer, pos);
    return pos;
};

//var MSG_PANELDEF = 151;
var PanelGeometry = Object.freeze ({PG_NOT_SPECIFIED:0,PG_SINGLE:1, PG_SIDEBYSIDE:2, PG_FOURSQUARE:3});
var PanelPosition = Object.freeze ({PP_NOT_SPECIFIED:0,PP_L:1, PP_R:2, PP_TL:1, PP_TR:2, PP_BL:3, PP_BR:4});
var PanelLayout = Object.freeze ({PL_NORMAL:0, PL_REVERSED:1});


function DLPanelDef () {
    DLBase.call(this);
    this.type = MessageType.MSG_PANELDEF;
    this.fg_color = new DLColor;
    this.bg_color = new DLColor;
    this.geometry=PanelGeometry.PG_NOT_SPECIFIED;
    this.position=PanelPosition.PP_NOT_SPECIFIED;
    this.layout=PanelLayout.PL_NORMAL;
    this.panel_location = new XYInfo;
    this.total_size = new XYInfo;
}

DLPanelDef.prototype = Object.create(DLBase.prototype);
DLPanelDef.prototype.constructor = DLPanelDef;
//override BuildMessageContents
DLPanelDef.prototype.BuildMessageContents = function(msg_buffer, pos) {
    //xy
    pos = this.EncodeInt (this.fg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.bg_color.value, msg_buffer, pos);
    pos = this.EncodeInt (this.geometry, msg_buffer, pos);
    pos = this.EncodeInt (this.position, msg_buffer, pos);
    pos = this.EncodeInt (this.layout, msg_buffer, pos);
    pos = this.EncodeInt (this.panel_location.x, msg_buffer, pos);
    pos = this.EncodeInt (this.panel_location.y, msg_buffer, pos);
    pos = this.EncodeInt (this.panel_location.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.panel_location.y_size, msg_buffer, pos);
    pos = this.EncodeInt (this.total_size.x, msg_buffer, pos);
    pos = this.EncodeInt (this.total_size.y, msg_buffer, pos);
    pos = this.EncodeInt (this.total_size.x_size, msg_buffer, pos);
    pos = this.EncodeInt (this.total_size.y_size, msg_buffer, pos);
    return pos;
};


//var MSG_GENERIC_CMD = 160;

//var MSG_DISPLAY_CMD = 163;
var DisplayRequest = Object.freeze ({DISPLAY_NO_REQUEST:0,DISPLAY_CLEAR:1});
var UpdateType = Object.freeze ({UPDATE_NONE:0,UPDATE_SPECIFIED_ITEMS:1,UPDATE_ALL:2});


function DLDisplayCmd () {
    DLBase.call(this);
    this.type = MessageType.MSG_DISPLAY_CMD;
    this.display_request = DisplayRequest.DISPLAY_NO_REQUEST;
    this.update_type = UpdateType.UPDATE_NONE;
    this.bright_level = -1;
    this.bright_range = -1;
}

DLDisplayCmd.prototype = Object.create(DLBase.prototype);
DLDisplayCmd.prototype.constructor = DLDisplayCmd;
//override BuildMessageContents
DLDisplayCmd.prototype.BuildMessageContents = function(msg_buffer, pos) {
	pos = this.EncodeInt (this.display_request, msg_buffer, pos);
	pos = this.EncodeInt (this.update_type, msg_buffer, pos);
	pos = this.EncodeInt (this.bright_level, msg_buffer, pos);
	pos = this.EncodeInt (this.bright_range, msg_buffer, pos);
    return pos;
}

//var MSG_TEXTBOX_CMD = 161;

//var MSG_TIMER_CMD = 162;
function DLTimerCmd () {
    DLBase.call(this);
    this.type = MessageType.MSG_TIMER_CMD;
    this.timer_request = 0;
    this.timer_ticks = -1;
    this.display_mode = TimerDisplayMode.DM_NONE;
    this.timer_precision = TimerPrecision.TP_NONE;
    this.fraction_threshold = -1;
}

DLTimerCmd.prototype = Object.create(DLBase.prototype);
DLTimerCmd.prototype.constructor = DLTimerCmd;
//override BuildMessageContents
DLTimerCmd.prototype.BuildMessageContents = function(msg_buffer, pos) {
	pos = this.EncodeInt (this.timer_request, msg_buffer, pos);
	pos = this.EncodeInt (this.timer_ticks, msg_buffer, pos);
    pos = this.EncodeInt (this.display_mode, msg_buffer, pos);
    pos = this.EncodeInt (this.timer_precision, msg_buffer, pos);
    pos = this.EncodeInt (this.fraction_threshold, msg_buffer, pos);
    return pos;
};
DLTimerCmd.prototype.InitFromJson = function (element_json, cmd_json) {
    this.layer = element_json.layer;
    this.parent_control = element_json.control_id;
    this.timer_request = cmd_json.timer_request;
    this.timer_ticks = cmd_json.timer_ticks;
    this.display_mode = cmd_json.timer_display_mode;
    this.timer_precision = cmd_json.timer_precision;
    this.fraction_threshold = cmd_json.fraction_threshold;
};

function CreateDLText () {
    return new DLText();
}

function CreateDLTextbox () {
    return new DLTextbox();
}

function CreateDLTimer () {
    return new DLTimer();
}

function CreateDLRect () {
    return new DLRect();
}

function CreateDLPanelDef () {
    return new DLPanelDef;
}

function CreateDLTextboxCmd () {
	return new DLTextboxCmd();
}

function CreateDLDisplayCmd () {
	return new DLDisplayCmd();
}

function CreateDLTimerCmd () {
    return new DLTimerCmd();
}

module.exports.DLRect = CreateDLRect;
module.exports.DLTextbox = CreateDLTextbox;
module.exports.DLTimer = CreateDLTimer;
module.exports.DLText = CreateDLText;
module.exports.DLPanelDef = CreateDLPanelDef;
module.exports.DLTextboxCmd = CreateDLTextboxCmd;
module.exports.DLDisplayCmd = CreateDLDisplayCmd;
module.exports.DLTimerCmd = CreateDLTimerCmd;
module.exports.XYInfo = XYInfo;
module.exports.DLColor = DLColor;
module.exports.ObjectCategory = ObjectCategory;
module.exports.DisplayRequest = DisplayRequest;
module.exports.UpdateType = UpdateType;
module.exports.GenericScope = GenericScope;
module.exports.MessageType = MessageType;
module.exports.MessageCommand = MessageCommand;
module.exports.ScrollCommand = ScrollCommand;
module.exports.ScrollOrientation = ScrollOrientation;
module.exports.ScrollEffect = ScrollEffect;
