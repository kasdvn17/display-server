// ---------------- Vietnamese free voice assistant ----------------
function voiceToolDefinitions() {
  return [
    {
      type: "function",
      name: "get_weather",
      description:
        "Get live weather, rain, air quality and UV. Use this for every weather/rain/AQI/UV request. The result is also shown as a Nest-style visual page.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "City/place name. Leave empty for the frame home/current configured location.",
          },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "get_ambient_context",
      description:
        "Lấy toàn bộ bối cảnh hiện tại của frame gồm thời tiết, chất lượng không khí, lịch, cảnh báo và các tuyến đi lại đã cấu hình. Dùng vị trí hiện tại do trình duyệt cung cấp.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "get_directions",
      description:
        "Find a driving route and automatically show a directions page. The browser securely supplies its current coordinates to this tool. When the user says “từ đây”, “vị trí hiện tại”, or omits the origin, leave origin empty so the server reverse-geocodes the live current address. If destination is missing or ambiguous, call request_followup instead of guessing. Do not call render_dynamic_ui afterwards.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description:
              "Optional starting address. Leave empty to use the frame current location.",
          },
          destination: {
            type: "string",
            description: "Required destination address or place name.",
          },
        },
        required: ["destination"],
      },
    },
    {
      type: "function",
      name: "show_recipe",
      description:
        "Create and automatically show the canonical visual recipe page. Use this whenever the user asks for a recipe, how to cook a dish, ingredients, or cooking steps. Supply a useful complete recipe in Vietnamese. Do not call render_dynamic_ui afterwards.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          timeMinutes: { type: "number" },
          servings: { type: "number" },
          ingredients: { type: "array", items: { type: "string" } },
          steps: { type: "array", items: { type: "string" } },
          tips: { type: "array", items: { type: "string" } },
        },
        required: ["title", "ingredients", "steps"],
      },
    },
    {
      type: "function",
      name: "add_alarm",
      description:
        "Create an alarm on Nest Frame. For relative requests such as “5 phút nữa” or “sau 2 tiếng”, pass relativeMinutes and DO NOT calculate HH:MM yourself; the server uses its current clock and frame timezone. For an explicit clock time, pass time.",
      parameters: {
        type: "object",
        properties: {
          time: {
            type: "string",
            description:
              "Explicit 24-hour HH:MM only. Omit for relative alarms.",
          },
          relativeMinutes: {
            type: "number",
            minimum: 1,
            maximum: 10080,
            description:
              "Exact delay from now in minutes. Always use this for relative requests.",
          },
          label: { type: "string" },
          repeatDays: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description: "0 Sunday through 6 Saturday. Empty means one-time.",
          },
          confirmCount: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "dismiss_alarm",
      description:
        "Dismiss/stop the alarm currently ringing on the Nest Frame.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "manage_alarms",
      description:
        "Liệt kê, bật, tắt, sửa hoặc xóa báo thức. Chỉ sửa/xóa khi người dùng yêu cầu rõ ràng; dùng id lấy từ action list.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "enable", "disable", "update", "delete"],
          },
          id: { type: "string" },
          time: { type: "string", description: "Giờ HH:MM khi sửa." },
          label: { type: "string" },
          repeatDays: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
          },
          confirmCount: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["action"],
      },
    },
    {
      type: "function",
      name: "manage_notifications",
      description:
        "Liệt kê, tạo, đánh dấu đã đọc hoặc bỏ thông báo khỏi Notification Center của frame.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "create", "read", "read_all", "dismiss"],
          },
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          priority: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: ["action"],
      },
    },
    {
      type: "function",
      name: "get_frame_status",
      description:
        "Lấy trạng thái màn hình, tab hiện tại, assistant, page đang mở, camera, diagnostics, notifications và các service đã cấu hình.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "control_frame",
      description:
        "Điều khiển màn hình đang online: chuyển tab, đóng page, quay lại, idle, reload, dừng assistant, thử lại service hoặc hiện một thông báo. Chỉ gọi khi người dùng yêu cầu.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "navigate",
              "close_page",
              "back",
              "idle",
              "reload",
              "stop_assistant",
              "retry_context",
              "retry_calendar",
              "retry_camera",
              "show_message"
            ],
          },
          view: {
            type: "string",
            enum: ["home", "today", "media", "news", "alarm"],
          },
          title: { type: "string" },
          text: { type: "string" },
        },
        required: ["action"],
      },
    },
    {
      type: "function",
      name: "spotify_control",
      description:
        "Điều khiển phát nhạc và âm lượng Spotify trên thiết bị Spotify Connect đang hoạt động.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "play",
              "pause",
              "next",
              "previous",
              "volume",
              "volume_up",
              "volume_down",
              "seek",
              "shuffle_on",
              "shuffle_off",
              "repeat_off",
              "repeat_context",
              "repeat_track",
            ],
            description:
              "Dùng volume khi đặt một mức cụ thể; dùng volume_up hoặc volume_down khi người dùng yêu cầu tăng hoặc giảm.",
          },
          volumePercent: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description:
              "Mức âm lượng tuyệt đối từ 0 đến 100, bắt buộc khi action là volume.",
          },
          step: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description:
              "Số phần trăm cần tăng hoặc giảm; mặc định là 10 khi người dùng không nêu rõ.",
          },
          positionSeconds: {
            type: "number",
            minimum: 0,
            description: "Vị trí cần tua tới, tính bằng giây.",
          },
        },
        required: ["action"],
      },
    },
    {
      type: "function",
      name: "spotify_play_search",
      description:
        "Search Spotify for a song and start the best matching result.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "spotify_search",
      description:
        "Tìm bài hát trong Spotify nhưng không tự phát. Trả về kết quả và URI để có thể thêm vào hàng đợi.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "spotify_queue_search",
      description:
        "Tìm bài hát trên Spotify và thêm kết quả phù hợp nhất vào hàng đợi hiện tại.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "spotify_library",
      description:
        "Lấy nhạc Spotify cá nhân gồm top tracks, bài phát gần đây và bài đã lưu. Dùng cache server để giảm quota.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "spotify_devices",
      description:
        "Liệt kê các thiết bị Spotify Connect hiện đang khả dụng, gồm thiết bị đang hoạt động, loại thiết bị và âm lượng.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "spotify_connection_status",
      description:
        "Kiểm tra Spotify đã cấu hình, đã kết nối hay đang cooldown/rate-limited. Không trả access token hoặc refresh token.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "spotify_now_playing",
      description:
        "Lấy bài hát hoặc podcast đang phát trên Spotify, trạng thái phát/tạm dừng, tiến độ, thiết bị đang dùng và âm lượng. Luôn gọi tool này khi người dùng hỏi đang phát gì hoặc Spotify đang ở trạng thái nào.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "spotify_select_player",
      description:
        "Chọn hoặc chuyển sang một Spotify Connect player khác. Có thể truyền tên hoặc ID lấy từ spotify_devices. Nếu nhạc đang phát thì tiếp tục phát trên player mới; nếu đang tạm dừng thì giữ trạng thái tạm dừng.",
      parameters: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: "ID chính xác của thiết bị từ spotify_devices.",
          },
          deviceName: {
            type: "string",
            description:
              "Tên thiết bị Spotify; chỉ dùng khi không có deviceId.",
          },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "get_calendar",
      description:
        "Get upcoming calendar events and show them visually. Use for schedule/calendar/what is next requests.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "list_routines",
      description:
        "Liệt kê các routine hiện có và nội dung gợi ý theo bối cảnh hiện tại.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "get_morning_briefing",
      description:
        "Tạo bản tóm tắt buổi sáng hiện tại gồm weather, calendar, commute và alerts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "get_news_feed",
      description:
        "Lấy các tin mới nhất từ NEWS_RSS_URL đã cấu hình cho tab Tin tức. Không dùng cho tìm kiếm theo chủ đề; khi đó dùng search_news.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
        required: [],
      },
    },
    {
      type: "function",
      name: "get_lyrics",
      description:
        "Tìm lời bài hát, ưu tiên lời đồng bộ từ LRCLIB và fallback lyrics.ovh.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          artist: { type: "string" },
          album: { type: "string" },
          durationSeconds: { type: "number", minimum: 0 },
        },
        required: ["title", "artist"],
      },
    },
    {
      type: "function",
      name: "get_camera_status",
      description:
        "Kiểm tra camera/intercom có được cấu hình không và trạng thái camera mà màn hình báo gần nhất. Không truy cập video hoặc thông tin WebRTC signaling.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "run_routine",
      description:
        "Run a server-prepared Nest Frame routine and show its canonical visual page. Use when the user asks for a morning briefing, says they are leaving, asks for today's overview, or wants an evening/bedtime preparation. Do not call render_dynamic_ui afterwards.",
      parameters: {
        type: "object",
        properties: {
          routine: {
            type: "string",
            enum: ["morning", "leaving", "day-check", "evening"],
          },
        },
        required: ["routine"],
      },
    },
    {
      type: "function",
      name: "search_news",
      description:
        "Search current/recent news on the web. ALWAYS use this for breaking news, accidents, incidents, current events, or questions containing words like mới nhất/vừa xảy ra/hôm nay.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Focused news search query, preferably in Vietnamese.",
          },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "web_search",
      description:
        "Search the public web for up-to-date factual information and return cited result cards. Use when the answer may have changed, the user asks to search/look up, or knowledge alone is insufficient.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "lookup_person",
      description:
        "Look up a real public person from Wikipedia/Wikidata and show a rich profile card with portrait and sourced biographical facts. Use for questions asking who a person is, public officials, ministers, politicians, authors, scientists, celebrities, etc. If the name is ambiguous, appears misspelled, or lookup fails, do not substitute an unrelated person: call request_followup and ask the user to repeat, spell, or clarify the name.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Person name or role, e.g. Bộ trưởng Bộ Ngoại giao Việt Nam.",
          },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "show_info",
      description:
        "Prepare and automatically show a stable general-information page. Do not call render_dynamic_ui afterwards.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                detail: { type: "string" },
              },
              required: ["value"],
            },
          },
        },
        required: ["title", "items"],
      },
    },
    {
      type: "function",
      name: "request_followup",
      description:
        "Signal that you need the user to answer a clarifying question in the same voice session. You MUST call this before asking about a name/entity that may be misspelled, was not found, has multiple plausible matches, or lacks information required to continue. Also use it for other genuinely missing required information. Do not call it after a complete answer or for optional offers.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "The single concise clarifying question you will ask aloud.",
          },
        },
        required: ["question"],
      },
    },
    {
      type: "function",
      name: "render_dynamic_ui",
      description:
        "Render one visual page only when no earlier data tool in this turn already provides a canonical page. YOU choose useful widgets, order, emphasis and 12-column span. Use only facts already supplied by the user or returned by tools in this turn. For links, copy the exact absolute HTTP(S) source URL into url; never use #, javascript:, a relative path, or a placeholder. Omit url when no real source URL exists. Never invent missing data. Do not call this after get_weather, get_directions, lookup_person, search_news, web_search, get_calendar, show_recipe or show_info, and do not call it for casual voice-only replies.",
      parameters: {
        type: "object",
        properties: {
          kicker: { type: "string" },
          title: { type: "string" },
          subtitle: { type: "string" },
          layout: {
            type: "object",
            properties: {
              columns: { type: "integer", minimum: 1, maximum: 12 },
              gap: { type: "integer", minimum: 0, maximum: 32 },
              density: {
                type: "string",
                enum: ["compact", "comfortable", "spacious"],
              },
            },
          },
          widgets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "hero",
                    "image",
                    "profile",
                    "text",
                    "stats",
                    "facts",
                    "chips",
                    "list",
                    "timeline",
                    "news",
                    "weather",
                    "forecast",
                    "sources",
                    "gallery",
                    "calendar",
                    "recipe",
                    "callout",
                  ],
                },
                span: { type: "integer", minimum: 1, maximum: 12 },
                order: { type: "integer", minimum: 0, maximum: 100 },
                emphasis: {
                  type: "string",
                  enum: ["hero", "normal", "subtle"],
                },
                title: { type: "string" },
                subtitle: { type: "string" },
                text: { type: "string" },
                value: { type: "string" },
                image: { type: "string" },
                url: { type: "string" },
                href: { type: "string" },
                link: { type: "string" },
                icon: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                      detail: { type: "string" },
                      title: { type: "string" },
                      subtitle: { type: "string" },
                      text: { type: "string" },
                      url: { type: "string" },
                      href: { type: "string" },
                      link: { type: "string" },
                      image: { type: "string" },
                      icon: { type: "string" },
                      time: { type: "string" },
                      date: { type: "string" },
                      source: { type: "string" },
                    },
                  },
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["title", "widgets"],
      },
    },
  ];
}

function voiceInstructions() {
  const nowParts = datePartsInZone(new Date(), FRAME_TIMEZONE);
  const frameNow =
    String(nowParts.y).padStart(4, "0") +
    "-" +
    String(nowParts.mo).padStart(2, "0") +
    "-" +
    String(nowParts.d).padStart(2, "0") +
    " " +
    String(nowParts.h).padStart(2, "0") +
    ":" +
    String(nowParts.mi).padStart(2, "0");
  return [
    "Bạn là trợ lý giọng nói của Nest Frame, nói tiếng Việt tự nhiên, ngắn gọn, thân thiện và giống một smart display.",
    "Mặc định trả lời bằng tiếng Việt. Nếu người dùng nói ngôn ngữ khác, có thể trả lời ngôn ngữ đó.",
    "Không đọc dài dòng những thứ đang được hiển thị trên màn hình; hãy nói tóm tắt 1-3 câu.",
    "Mỗi lượt chỉ trả lời bằng giọng nói MỘT lần. Trước khi gọi tool không nói trước rằng đã làm hoặc đã hiển thị; hãy chờ toàn bộ tool result rồi mới trả lời một câu tóm tắt cuối cùng. Không lặp lại câu xác nhận sau render_dynamic_ui.",
    "Nếu thực sự cần thêm thông tin để làm đúng yêu cầu, BẮT BUỘC gọi request_followup trước, sau đó hỏi đúng một câu làm rõ và chờ người dùng trả lời trong cùng phiên. MỌI câu trả lời kết thúc bằng một câu hỏi cần người dùng trả lời đều phải gọi request_followup trong cùng lượt; tuyệt đối không chỉ nói câu hỏi rồi kết thúc. Không gọi request_followup sau câu trả lời hoàn chỉnh, không dùng nó để hỏi xã giao như “bạn có cần gì thêm không”. Khi tool trả lỗi, nói rõ tên thao tác và lỗi ngắn gọn; không nói rằng đã hoàn thành.",
    "QUY TẮC FOLLOW-UP BẮT BUỘC: nếu tên người, tổ chức, địa điểm hoặc chủ đề có vẻ nghe sai/viết sai, không tìm thấy, mơ hồ, hoặc có nhiều kết quả hợp lý, KHÔNG được kết thúc bằng câu “có thể bạn đã viết sai” và KHÔNG tự chọn một kết quả khác. Hãy gọi request_followup, hỏi người dùng nhắc lại/đánh vần/làm rõ đúng một câu, rồi chờ câu trả lời tiếp theo. Sau follow-up mới chạy lại tool tra cứu với thông tin mới.",
    "Dynamic UI: Weather, Directions, Person, News, Calendar, Recipe, routines và Info đều dùng CHUNG renderer. Mỗi tool dữ liệu có display đã tự tạo một page canonical ổn định ở client.",
    "Mỗi lượt chỉ được tạo TỐI ĐA MỘT page. Sau get_weather, get_directions, lookup_person, search_news, get_news_feed, web_search, get_calendar, get_morning_briefing, run_routine, show_recipe hoặc show_info, KHÔNG gọi render_dynamic_ui nữa và không tạo page lần hai.",
    "Chỉ gọi render_dynamic_ui khi không dùng bất kỳ tool dữ liệu có page canonical nào ở trên. Khi đó tự chọn 2-6 widget hữu ích, thứ tự, emphasis và span trên grid 12 cột; tối đa khoảng 8 widget, tối đa 1 hero, và chỉ dùng dữ kiện đã biết.",
    "Nếu câu trả lời không cần nội dung giữ trên màn hình thì KHÔNG gọi render_dynamic_ui; chỉ trả lời bằng giọng nói.",
    "Khi hỏi weather/rain/AQI/UV LUÔN gọi get_weather. Khi hỏi recipe/cách nấu và đã có tên món hoặc đủ nguyên liệu LUÔN gọi show_recipe. Nếu người dùng chỉ hỏi chung chung về công thức/cách nấu nhưng chưa nói món gì hoặc nguyên liệu chính nào, BẮT BUỘC gọi request_followup và hỏi họ muốn nấu món gì; không được chỉ nói câu hỏi rồi kết thúc lượt.",
    "Khi người dùng hỏi đường đi, khoảng cách hoặc thời gian di chuyển, gọi get_directions. Nếu người dùng nói “từ đây”, “chỗ tôi” hoặc không nói điểm xuất phát thì để origin trống: tool sẽ dùng tọa độ hiện tại và trả địa chỉ hiện tại cho bạn. Nếu chưa có điểm đến hoặc địa điểm mơ hồ, BẮT BUỘC gọi request_followup và hỏi đúng một câu làm rõ trước khi tìm đường. Hiện chỉ cung cấp ước tính tuyến lái xe.",
    "Khi hỏi calendar/lịch sắp tới gọi get_calendar. Khi hỏi toàn bộ bối cảnh xung quanh gồm weather, air, commute, lịch và alert, gọi get_ambient_context. Khi muốn biết các routine có thể chạy, gọi list_routines. Khi người dùng nói chào buổi sáng hoặc hỏi briefing sáng, gọi get_morning_briefing; khi sắp ra ngoài, kiểm tra hôm nay, buổi tối hoặc đi ngủ, gọi run_routine với routine phù hợp. Với thông tin tổng quát có ích để giữ trên màn hình, gọi show_info; page sẽ tự hiển thị.",
    "Bạn CÓ khả năng tìm Internet qua tool. Với tin mới, tai nạn, sự cố, sự kiện hôm nay/mới nhất/vừa xảy ra LUÔN gọi search_news trước khi trả lời. Không được nói rằng bạn không thể tìm kiếm realtime nếu chưa thử tool.",
    "Với câu hỏi cần tra cứu web hoặc thông tin có thể thay đổi, gọi web_search. Khi hỏi về một người/public figure, dùng lookup_person. Nếu người dùng chỉ nói CHỨC DANH mà chưa nêu tên, hãy gọi web_search trước để xác định người đang giữ chức hiện tại, sau đó gọi lookup_person bằng HỌ TÊN vừa tìm được. Có thể gọi search_news để xác minh thay đổi chức vụ mới.",
    "Khi dùng kết quả search, chỉ khẳng định điều được nguồn hỗ trợ; nói ngắn gọn và để chi tiết/sources trong dynamic UI. Không bịa dữ kiện còn thiếu.",
    "Mọi link trong dynamic UI phải sao chép nguyên URL HTTP(S) tuyệt đối từ tool result. Tuyệt đối không dùng #, đường dẫn tương đối hoặc URL giả; nếu không có URL nguồn thật thì bỏ link và không tạo nút “Mở chi tiết”.",
    "Khi người dùng yêu cầu alarm hoặc Spotify, dùng tool tương ứng. Dùng manage_alarms action list trước nếu cần id để sửa/xóa; chỉ sửa hoặc xóa khi người dùng yêu cầu rõ. Khi hỏi đang phát gì, LUÔN gọi spotify_now_playing. Dùng spotify_search để chỉ tìm, spotify_play_search để tìm và phát, spotify_queue_search để thêm vào hàng đợi, spotify_library cho top/recent/saved. Với âm lượng, seek, shuffle và repeat dùng spotify_control đúng action. Khi người dùng muốn xem thiết bị Spotify, gọi spotify_devices. Khi họ muốn chọn hoặc đổi player, gọi spotify_select_player với deviceId hoặc deviceName; nếu chưa nêu player hoặc tên không đủ rõ, gọi spotify_devices rồi request_followup để họ chọn, không tự đoán. Với alarm tương đối như “5 phút nữa”, “sau nửa tiếng” hoặc “2 tiếng nữa”, truyền relativeMinutes cho add_alarm và tuyệt đối không tự cộng thành HH:MM. Chỉ truyền time khi người dùng nêu giờ đồng hồ cụ thể. Sau tool, xác nhận ngắn gọn.",
    "Dùng get_frame_status để kiểm tra frame/camera/service. Chỉ dùng control_frame khi người dùng yêu cầu rõ một thao tác trên màn hình. Dùng manage_notifications cho notification center; chỉ tạo, đánh dấu hoặc bỏ thông báo khi người dùng yêu cầu rõ, còn action list là chỉ đọc. Dùng get_news_feed cho nguồn RSS mặc định và search_news cho truy vấn tin theo chủ đề. Dùng get_lyrics khi người dùng muốn lời một bài cụ thể; nếu đang phát và chưa biết tên bài, gọi spotify_now_playing trước. Không bao giờ yêu cầu, đọc hoặc tiết lộ token, API key, OAuth credential hay WebRTC signaling.",
    "Nếu tool trả lỗi, nói rõ ngắn gọn thay vì giả vờ đã thực hiện.",
    "Thời gian mặc định theo múi giờ của frame: " +
    FRAME_TIMEZONE +
    ". Thời điểm hiện tại khi bắt đầu phiên là " +
    frameNow +
    ".",
  ].join(" ");
}

async function geocodeVoiceLocation(query) {
  const q = String(query || "").trim();
  if (!q) {
    const lat = FRAME_LATITUDE,
      lon = FRAME_LONGITUDE;
    if (lat != null && lon != null)
      return {
        latitude: lat,
        longitude: lon,
        name: FRAME_LOCATION_NAME,
      };
    throw new Error("Chưa cấu hình vị trí mặc định cho frame");
  }
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", q);
  u.searchParams.set("count", "1");
  u.searchParams.set("language", "vi");
  u.searchParams.set("format", "json");
  const data = await fetchJsonExternal(u.toString(), 7000);
  const x = data && Array.isArray(data.results) ? data.results[0] : null;
  if (!x) throw new Error("Không tìm thấy địa điểm");
  return {
    latitude: Number(x.latitude),
    longitude: Number(x.longitude),
    name: [x.name, x.admin1, x.country].filter(Boolean).join(", "),
  };
}

async function fetchNominatimJson(url) {
  const run = async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - nominatimLastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nominatimLastRequestAt = Date.now();
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          accept: "application/json",
          "accept-language": "vi,en;q=0.8",
          "user-agent": NOMINATIM_USER_AGENT,
        },
      },
      9000,
    );
    if (!response.ok) {
      response.__releaseTimeout?.();
      throw new Error(`Geocoding HTTP ${response.status}`);
    }
    return await response.json();
  };
  const task = nominatimQueue.then(run, run);
  nominatimQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return await task;
}

function routeCoordinate(value) {
  if (!value || typeof value !== "object") return null;
  const latitude = finiteCoord(value.latitude ?? value.lat, -90, 90),
    longitude = finiteCoord(
      value.longitude ?? value.lon ?? value.lng,
      -180,
      180,
    );
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

async function geocodeVoiceAddress(query, hint) {
  const text = cleanExternalText(query, 320);
  if (!text) throw new Error("Thiếu địa chỉ cần tìm");
  const coordinateMatch = text.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (coordinateMatch) {
    const latitude = finiteCoord(coordinateMatch[1], -90, 90),
      longitude = finiteCoord(coordinateMatch[2], -180, 180);
    if (latitude != null && longitude != null)
      return { latitude, longitude, name: text };
  }
  const key = "search:" + text.toLocaleLowerCase("vi"),
    cached = voiceGeocodeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const url = new URL(NOMINATIM_BASE_URL + "/search");
  url.searchParams.set("q", text);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "vi");
  if (NOMINATIM_EMAIL) url.searchParams.set("email", NOMINATIM_EMAIL);
  if (hint) {
    url.searchParams.set(
      "viewbox",
      `${hint.longitude - 2},${hint.latitude + 2},${hint.longitude + 2},${hint.latitude - 2}`,
    );
    url.searchParams.set("bounded", "0");
  }
  const data = await fetchNominatimJson(url.toString()),
    place = Array.isArray(data) ? data[0] : null;
  const latitude = finiteCoord(place && place.lat, -90, 90),
    longitude = finiteCoord(place && place.lon, -180, 180);
  if (latitude == null || longitude == null)
    throw new Error(`Không tìm thấy địa chỉ “${text}”`);
  const value = {
    latitude,
    longitude,
    name: cleanExternalText(place.display_name || text, 500),
  };
  boundedCacheSet(
    voiceGeocodeCache,
    key,
    { expires: Date.now() + 24 * 60 * 60 * 1000, value },
    300,
  );
  return value;
}

async function reverseGeocodeVoiceAddress(coordinate) {
  const rounded = `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`,
    key = "reverse:" + rounded,
    cached = voiceGeocodeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const url = new URL(NOMINATIM_BASE_URL + "/reverse");
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "vi");
  if (NOMINATIM_EMAIL) url.searchParams.set("email", NOMINATIM_EMAIL);
  const data = await fetchNominatimJson(url.toString()),
    value = {
      ...coordinate,
      name: cleanExternalText(
        (data && data.display_name) || FRAME_LOCATION_NAME,
        500,
      ),
    };
  boundedCacheSet(
    voiceGeocodeCache,
    key,
    { expires: Date.now() + 30 * 60 * 1000, value },
    300,
  );
  return value;
}

function routeStepText(step) {
  const maneuver = (step && step.maneuver) || {},
    type = String(maneuver.type || ""),
    modifier = String(maneuver.modifier || ""),
    road = cleanExternalText((step && step.name) || "", 160),
    exit = Number(maneuver.exit) || 0;
  if (type === "depart") return road ? `Khởi hành theo ${road}` : "Khởi hành";
  if (type === "arrive") return "Đến điểm đến";
  if (type === "roundabout" || type === "rotary")
    return `Đi vào vòng xuyến${exit ? `, ra ở lối thứ ${exit}` : ""}${road ? ` để vào ${road}` : ""}`;
  const turns = {
    right: "Rẽ phải",
    "sharp right": "Rẽ ngoặt phải",
    "slight right": "Chếch phải",
    left: "Rẽ trái",
    "sharp left": "Rẽ ngoặt trái",
    "slight left": "Chếch trái",
    straight: "Đi thẳng",
    uturn: "Quay đầu",
  };
  if (
    type === "turn" ||
    type === "fork" ||
    type === "end of road" ||
    type === "merge"
  )
    return `${turns[modifier] || "Tiếp tục"}${road ? ` vào ${road}` : ""}`;
  return road ? `Tiếp tục theo ${road}` : "Tiếp tục";
}

async function getVoiceDirections(args, context) {
  const destinationText = cleanExternalText(args && args.destination, 320);
  if (!destinationText)
    throw new Error("Thiếu điểm đến; cần hỏi người dùng trước khi tìm đường");
  const suppliedCurrent = routeCoordinate(context && context.currentLocation),
    configuredCurrent = routeCoordinate({
      latitude: FRAME_LATITUDE,
      longitude: FRAME_LONGITUDE,
    }),
    current = suppliedCurrent || configuredCurrent;
  const originText = cleanExternalText(args && args.origin, 320),
    usesCurrent =
      !originText ||
      /^(?:đây|từ đây|vị trí hiện tại|chỗ tôi|nhà|home|current location)$/i.test(
        originText,
      );
  if (usesCurrent && !current)
    throw new Error(
      "Không nhận được vị trí hiện tại. Hãy bật quyền vị trí hoặc cấu hình FRAME_LATITUDE và FRAME_LONGITUDE",
    );
  let origin;
  if (usesCurrent) {
    origin = await reverseGeocodeVoiceAddress(current).catch(() => ({
      ...current,
      name: FRAME_LOCATION_NAME,
    }));
  } else origin = await geocodeVoiceAddress(originText, current);
  const destination = await geocodeVoiceAddress(destinationText, origin),
    routeUrl = new URL(
      `${OSRM_BASE_URL}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`,
    );
  routeUrl.searchParams.set("overview", "false");
  routeUrl.searchParams.set("steps", "true");
  routeUrl.searchParams.set("alternatives", "false");
  const data = await fetchJsonExternal(routeUrl.toString(), 10000),
    route = data && Array.isArray(data.routes) ? data.routes[0] : null;
  if (
    !route ||
    !Number.isFinite(Number(route.duration)) ||
    !Number.isFinite(Number(route.distance))
  )
    throw new Error("Không tìm thấy tuyến đường phù hợp");
  const rawSteps =
    route.legs && route.legs[0] && Array.isArray(route.legs[0].steps)
      ? route.legs[0].steps
      : [],
    steps = rawSteps
      .filter((x) => x && Number(x.distance) >= 1)
      .slice(0, 14)
      .map((x, i) => ({
        index: i + 1,
        instruction: routeStepText(x),
        distanceMeters: Math.round(Number(x.distance) || 0),
        durationMinutes: Math.max(1, Math.round(Number(x.duration || 0) / 60)),
      }));
  const mapsUrl = new URL("https://www.google.com/maps/dir/");
  mapsUrl.searchParams.set("api", "1");
  mapsUrl.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  mapsUrl.searchParams.set(
    "destination",
    `${destination.latitude},${destination.longitude}`,
  );
  mapsUrl.searchParams.set("travelmode", "driving");
  return {
    kind: "directions",
    mode: "driving",
    origin,
    destination,
    durationMinutes: Math.max(1, Math.round(Number(route.duration) / 60)),
    distanceKm: Math.round(Number(route.distance) / 100) / 10,
    steps,
    mapsUrl: mapsUrl.toString(),
    provider: "OpenStreetMap · OSRM",
  };
}

async function getVoiceWeather(location) {
  const place = await geocodeVoiceLocation(location);
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", place.latitude);
  u.searchParams.set("longitude", place.longitude);
  u.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,precipitation,rain,wind_speed_10m,relative_humidity_2m",
  );
  u.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,weather_code",
  );
  u.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
  );
  u.searchParams.set("forecast_days", "5");
  u.searchParams.set("timezone", "auto");
  const aq = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  aq.searchParams.set("latitude", place.latitude);
  aq.searchParams.set("longitude", place.longitude);
  aq.searchParams.set("current", "us_aqi,pm2_5,uv_index");
  aq.searchParams.set("timezone", "auto");
  const [w, a] = await Promise.all([
    fetchJsonExternal(u.toString(), 8000),
    fetchJsonExternal(aq.toString(), 8000).catch(() => null),
  ]);
  const c = w.current || {},
    h = w.hourly || {},
    d = w.daily || {},
    now = Date.now();
  const hourly = [];
  for (let i = 0; i < (h.time || []).length && hourly.length < 8; i++) {
    const t = new Date(h.time[i]).getTime();
    if (Number.isFinite(t) && t >= now - 20 * 60000)
      hourly.push({
        time: h.time[i],
        temperature: Number((h.temperature_2m || [])[i]),
        rainChance: Number((h.precipitation_probability || [])[i]) || 0,
        condition: weatherCodeLabel((h.weather_code || [])[i]),
      });
  }
  const daily = [];
  for (let i = 0; i < Math.min(5, (d.time || []).length); i++)
    daily.push({
      date: d.time[i],
      condition: weatherCodeLabel((d.weather_code || [])[i]),
      max: Number((d.temperature_2m_max || [])[i]),
      min: Number((d.temperature_2m_min || [])[i]),
      rainChance: Number((d.precipitation_probability_max || [])[i]) || 0,
      uv: Number((d.uv_index_max || [])[i]),
    });
  return {
    kind: "weather",
    location: place.name,
    timezone: w.timezone || FRAME_TIMEZONE,
    current: {
      temperature: Number(c.temperature_2m),
      feelsLike: Number(c.apparent_temperature),
      condition: weatherCodeLabel(c.weather_code),
      rain: Number(c.rain) || 0,
      humidity: Number(c.relative_humidity_2m),
      wind: Number(c.wind_speed_10m),
      aqi: a && a.current ? Number(a.current.us_aqi) : null,
      aqiLabel: a && a.current ? aqiLabel(a.current.us_aqi) : "",
      pm25: a && a.current ? Number(a.current.pm2_5) : null,
      uv: a && a.current ? Number(a.current.uv_index) : null,
    },
    hourly,
    daily,
  };
}

function cleanExternalText(value, maxLen = 500) {
  return htmlEntityDecode(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, maxLen);
}

function splitNewsPublisher(rawTitle, fallback = "Tin tức") {
  let title = String(rawTitle || "").trim(),
    source = "";
  const m = title.match(/\s+-\s+([^\-]{2,80})$/);
  if (m) {
    source = m[1].trim();
    title = title.slice(0, m.index).trim();
  }
  return { title, source: source || fallback };
}

async function searchVoiceNews(query, limit = 7) {
  query = String(query || "").trim();
  if (!query) throw new Error("Thiếu nội dung tìm tin");
  limit = Math.max(1, Math.min(10, Number(limit) || 7));
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "vi");
  url.searchParams.set("gl", "VN");
  url.searchParams.set("ceid", "VN:vi");
  const feed = await rssParser.parseURL(url.toString());
  let items = (feed.items || [])
    .slice(0, limit)
    .map((item, index) => {
      const parsed = splitNewsPublisher(
        item.title,
        feed.title || "Google News",
      );
      let image = "";
      if (item.enclosure && item.enclosure.url) image = item.enclosure.url;
      if (!image && item["media:content"] && item["media:content"].$)
        image = item["media:content"].$.url || "";
      if (!image)
        image = firstHtmlImage(item.content || item.contentSnippet || "");
      return {
        id: item.guid || item.id || String(index),
        title: parsed.title,
        source: parsed.source,
        url: item.link || "",
        publishedAt: item.isoDate || item.pubDate || "",
        image,
        summary: cleanExternalText(
          item.contentSnippet || item.summary || "",
          260,
        ),
      };
    })
    .filter((x) => x.title);
  items = await enrichNewsItems(
    items.map((x) => ({ ...x, link: x.url })),
    Math.min(6, items.length),
  );
  items = items.map((x) => ({
    id: x.id,
    title: x.title,
    source: x.source,
    url: safePublicMediaUrl(x.link || x.url),
    publishedAt: x.publishedAt,
    image: safePublicMediaUrl(x.image),
    summary: x.summary || "",
  }));
  return {
    kind: "news-search",
    query,
    title: "Tin tức",
    subtitle: `Kết quả mới cho “${query}”`,
    items,
    sources: ["Google News RSS"],
  };
}

function decodeDuckUrl(href) {
  try {
    const u = new URL(
      htmlEntityDecode(String(href || "")),
      "https://duckduckgo.com",
    );
    const target = u.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : u.href;
  } catch (_) {
    return String(href || "");
  }
}
function domainLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

async function searchWikipediaPages(query, lang = "vi", limit = 3) {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  u.searchParams.set("action", "query");
  u.searchParams.set("format", "json");
  u.searchParams.set("formatversion", "2");
  u.searchParams.set("generator", "search");
  u.searchParams.set("gsrsearch", query);
  u.searchParams.set("gsrlimit", String(Math.max(1, Math.min(5, limit))));
  u.searchParams.set("prop", "extracts|pageimages|info");
  u.searchParams.set("exintro", "1");
  u.searchParams.set("explaintext", "1");
  u.searchParams.set("piprop", "thumbnail|original");
  u.searchParams.set("pithumbsize", "500");
  u.searchParams.set("inprop", "url");
  u.searchParams.set("redirects", "1");
  u.searchParams.set("utf8", "1");
  const data = await fetchJsonExternal(u.toString(), 8000);
  return ((data && data.query && data.query.pages) || [])
    .filter((x) => !x.missing)
    .map((p) => ({
      title: p.title || "",
      url:
        p.fullurl ||
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title || "").replace(/ /g, "_"))}`,
      domain: `${lang}.wikipedia.org`,
      snippet: cleanExternalText(p.extract || "", 360),
      image:
        (p.thumbnail && p.thumbnail.source) ||
        (p.original && p.original.source) ||
        "",
      source: lang === "vi" ? "Wikipedia tiếng Việt" : "Wikipedia",
    }));
}

async function searchDuckDuckGo(query, limit = 7) {
  const u = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const html = await fetchTextExternal(u, 8500);
  const out = [];
  const re =
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const url = decodeDuckUrl(m[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const tail = html.slice(re.lastIndex, re.lastIndex + 3500);
    const sm = tail.match(
      /<(?:a|div)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );
    out.push({
      title: cleanExternalText(m[2], 180),
      url,
      domain: domainLabel(url),
      snippet: cleanExternalText(sm ? sm[1] : "", 360),
      image: "",
      source: domainLabel(url) || "Web",
    });
  }
  return out;
}

async function searchVoiceWeb(query, limit = 7) {
  query = String(query || "").trim();
  if (!query) throw new Error("Thiếu nội dung tìm kiếm");
  limit = Math.max(1, Math.min(10, Number(limit) || 7));
  const [wiki, duck] = await Promise.all([
    searchWikipediaPages(query, "vi", 2).catch(() => []),
    searchDuckDuckGo(query, limit).catch(() => []),
  ]);
  const seen = new Set(),
    items = [];
  for (const x of [...wiki, ...duck]) {
    const key = String(x.url || "").replace(/\/$/, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(x);
    if (items.length >= limit) break;
  }
  if (!items.length) {
    const en = await searchWikipediaPages(
      query,
      "en",
      Math.min(3, limit),
    ).catch(() => []);
    items.push(...en);
  }
  return {
    kind: "web-search",
    query,
    title: "Kết quả tìm kiếm",
    subtitle: `Nguồn web cho “${query}”`,
    items,
    sources: ["Wikipedia", "DuckDuckGo"],
  };
}

function firstClaimValue(entity, prop) {
  const arr = entity && entity.claims && entity.claims[prop];
  if (!Array.isArray(arr)) return null;
  for (const c of arr) {
    const v =
      c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    if (v != null) return v;
  }
  return null;
}
function claimEntityIds(entity, prop, max = 6) {
  const arr = entity && entity.claims && entity.claims[prop];
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const c of arr) {
    const v =
      c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    if (v && typeof v === "object" && v.id && !out.includes(v.id))
      out.push(v.id);
    if (out.length >= max) break;
  }
  return out;
}
function wikidataDate(value) {
  const t = value && typeof value === "object" ? value.time : value;
  if (!t) return "";
  const m = String(t).match(/^[+-](\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  if (!y) return "";
  return (
    (d ? String(d).padStart(2, "0") + "/" : "") +
    (mo ? String(mo).padStart(2, "0") + "/" : "") +
    y
  );
}
async function wikidataLabels(ids) {
  if (!ids.length) return {};
  const u = new URL("https://www.wikidata.org/w/api.php");
  u.searchParams.set("action", "wbgetentities");
  u.searchParams.set("format", "json");
  u.searchParams.set("ids", ids.join("|"));
  u.searchParams.set("props", "labels");
  u.searchParams.set("languages", "vi|en");
  u.searchParams.set("languagefallback", "1");
  const d = await fetchJsonExternal(u.toString(), 8000);
  const out = {};
  for (const id of ids) {
    const e = d && d.entities && d.entities[id];
    out[id] =
      (e &&
        ((e.labels && e.labels.vi && e.labels.vi.value) ||
          (e.labels && e.labels.en && e.labels.en.value))) ||
      id;
  }
  return out;
}
function extractHometownFromIntro(text) {
  const m = String(text || "").match(
    /(?:quê quán|nguyên quán|quê ở|quê tại)\s*(?:là|ở|tại|:)?\s*([^.;\n]{2,100})/i,
  );
  return m
    ? cleanExternalText(m[1], 90)
      .replace(/\s+(?:ông|bà|anh|chị)\b.*$/i, "")
      .trim()
    : "";
}

async function lookupVoicePerson(query) {
  query = String(query || "").trim();
  if (!query) throw new Error("Thiếu tên người cần tra cứu");
  async function find(lang) {
    const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    u.searchParams.set("action", "query");
    u.searchParams.set("format", "json");
    u.searchParams.set("formatversion", "2");
    u.searchParams.set("generator", "search");
    u.searchParams.set("gsrsearch", query);
    u.searchParams.set("gsrlimit", "1");
    u.searchParams.set("prop", "extracts|pageimages|pageprops|info");
    u.searchParams.set("exintro", "1");
    u.searchParams.set("explaintext", "1");
    u.searchParams.set("piprop", "thumbnail|original");
    u.searchParams.set("pithumbsize", "800");
    u.searchParams.set("inprop", "url");
    u.searchParams.set("redirects", "1");
    const d = await fetchJsonExternal(u.toString(), 8500);
    const p = d && d.query && d.query.pages && d.query.pages[0];
    return p && !p.missing ? { ...p, lang } : null;
  }
  let page = await find("vi").catch(() => null);
  if (!page) page = await find("en").catch(() => null);
  if (!page) throw new Error("Không tìm thấy hồ sơ phù hợp trên Wikipedia");
  const qid = page.pageprops && page.pageprops.wikibase_item;
  let entity = null;
  if (qid) {
    const u = new URL("https://www.wikidata.org/w/api.php");
    u.searchParams.set("action", "wbgetentities");
    u.searchParams.set("format", "json");
    u.searchParams.set("ids", qid);
    u.searchParams.set("props", "claims|labels|descriptions");
    u.searchParams.set("languages", "vi|en");
    u.searchParams.set("languagefallback", "1");
    const d = await fetchJsonExternal(u.toString(), 8500).catch(() => null);
    entity = d && d.entities && d.entities[qid];
  }
  const ids = [
    ...claimEntityIds(entity, "P19", 1),
    ...claimEntityIds(entity, "P27", 3),
    ...claimEntityIds(entity, "P106", 4),
    ...claimEntityIds(entity, "P39", 4),
  ];
  const labels = await wikidataLabels([...new Set(ids)]).catch(() => ({}));
  const birthPlaceIds = claimEntityIds(entity, "P19", 1),
    countryIds = claimEntityIds(entity, "P27", 3),
    occupationIds = claimEntityIds(entity, "P106", 4),
    positionIds = claimEntityIds(entity, "P39", 4);
  const intro = cleanExternalText(page.extract || "", 900);
  let image =
    (page.original && page.original.source) ||
    (page.thumbnail && page.thumbnail.source) ||
    "";
  const commons = firstClaimValue(entity, "P18");
  if (!image && commons) {
    const file = typeof commons === "string" ? commons : String(commons);
    image =
      "https://commons.wikimedia.org/wiki/Special:FilePath/" +
      encodeURIComponent(file) +
      "?width=900";
  }
  const label =
    (entity &&
      ((entity.labels && entity.labels.vi && entity.labels.vi.value) ||
        (entity.labels && entity.labels.en && entity.labels.en.value))) ||
    page.title;
  const description =
    (entity &&
      ((entity.descriptions &&
        entity.descriptions.vi &&
        entity.descriptions.vi.value) ||
        (entity.descriptions &&
          entity.descriptions.en &&
          entity.descriptions.en.value))) ||
    "";
  const facts = [];
  const dob = wikidataDate(firstClaimValue(entity, "P569")),
    dod = wikidataDate(firstClaimValue(entity, "P570")),
    home = extractHometownFromIntro(intro);
  if (dob) facts.push({ label: "Năm sinh / ngày sinh", value: dob });
  if (dod) facts.push({ label: "Ngày mất", value: dod });
  if (home) facts.push({ label: "Quê quán", value: home });
  if (birthPlaceIds.length)
    facts.push({
      label: "Nơi sinh",
      value: birthPlaceIds.map((id) => labels[id] || id).join(", "),
    });
  if (countryIds.length)
    facts.push({
      label: "Quốc tịch",
      value: countryIds.map((id) => labels[id] || id).join(", "),
    });
  if (occupationIds.length)
    facts.push({
      label: "Nghề nghiệp",
      value: occupationIds.map((id) => labels[id] || id).join(", "),
    });
  if (positionIds.length)
    facts.push({
      label: "Chức vụ (Wikidata)",
      value: positionIds.map((id) => labels[id] || id).join(", "),
    });
  const wikiUrl =
    page.fullurl ||
    `https://${page.lang}.wikipedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/ /g, "_"))}`;
  return {
    kind: "person",
    title: label,
    subtitle: description,
    image,
    summary: intro,
    facts,
    sources: [
      { name: `Wikipedia ${page.lang.toUpperCase()}`, url: wikiUrl },
      {
        name: "Wikidata",
        url: qid ? `https://www.wikidata.org/wiki/${qid}` : "",
        id: qid || "",
      },
    ].filter((x) => x.url),
  };
}

function normalizeRecipeEntry(value, kind, index) {
  if (value == null) return "";
  if (typeof value !== "object") {
    const text = cleanExternalText(String(value), kind === "step" ? 900 : 400)
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .trim();
    return kind === "step" && /^bước\s*\d+\s*[:.-]?$/i.test(text) ? "" : text;
  }
  if (kind === "ingredient") {
    const amount = cleanExternalText(
      value.amount || value.quantity || value.qty || "",
      80,
    ),
      unit = cleanExternalText(value.unit || "", 80);
    const name = cleanExternalText(
      value.ingredient ||
      value.name ||
      value.title ||
      value.value ||
      value.text ||
      value.detail ||
      "",
      300,
    );
    return [amount, unit, name]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const title = cleanExternalText(
    value.title || value.label || value.name || "",
    180,
  ),
    detail = cleanExternalText(
      value.instruction ||
      value.description ||
      value.detail ||
      value.text ||
      value.value ||
      value.step ||
      "",
      kind === "step" ? 900 : 400,
    );
  if (kind === "step") {
    if (detail && (/^bước\s*\d+\s*[:.-]?$/i.test(title) || !title))
      return detail;
    if (
      title &&
      detail &&
      title.toLocaleLowerCase("vi") !== detail.toLocaleLowerCase("vi")
    )
      return `${title}: ${detail}`;
    const only = detail || title;
    return /^bước\s*\d+\s*[:.-]?$/i.test(only) ? "" : only;
  }
  return detail || title || cleanExternalText(value.tip || "", 400);
}

function normalizeRecipeList(value, kind, max) {
  const input = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n+/)
      : [],
    seen = new Set(),
    out = [];
  for (let i = 0; i < input.length && out.length < max; i++) {
    const text = normalizeRecipeEntry(input[i], kind, i).trim(),
      key = text.toLocaleLowerCase("vi");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

async function getSpotifyDevicesForVoice() {
  if (
    spotifyDevicesCache.payload &&
    Array.isArray(spotifyDevicesCache.payload.devices) &&
    (spotifyDevicesCache.expires > Date.now() ||
      spotifyRateLimitUntil > Date.now())
  )
    return spotifyDevicesCache.payload.devices;
  if (spotifyDevicesCache.pending) {
    const pendingPayload = await spotifyDevicesCache.pending;
    if (pendingPayload && Array.isArray(pendingPayload.devices))
      return pendingPayload.devices;
  }

  const data = await spotifyApi("/me/player/devices");
  const devices = ((data || {}).devices || [])
    .map((device) => ({
      id: String(device.id || ""),
      name: String(device.name || "Thiết bị không tên"),
      type: String(device.type || "Unknown"),
      isActive: !!device.is_active,
      isRestricted: !!device.is_restricted,
      volumePercent:
        device.volume_percent == null ? null : Number(device.volume_percent),
    }))
    .filter((device) => device.id);

  spotifyDevicesCache = {
    expires: Date.now() + 30 * 1000,
    payload: { devices },
    pending: null,
  };
  return devices;
}

async function getSpotifyLibraryForVoice() {
  if (
    spotifyPersonalCache.payload &&
    (spotifyPersonalCache.expires > Date.now() ||
      spotifyRateLimitUntil > Date.now())
  )
    return spotifyPersonalCache.payload;
  const settled = await Promise.allSettled([
    spotifyApi("/me/top/tracks", {
      query: { time_range: "short_term", limit: 10 },
    }),
    spotifyApi("/me/player/recently-played", { query: { limit: 10 } }),
    spotifyApi("/me/tracks", { query: { limit: 10 } }),
  ]);
  if (!settled.some((entry) => entry.status === "fulfilled"))
    throw settled.find((entry) => entry.status === "rejected").reason;
  const payload = {
    top:
      settled[0].status === "fulfilled"
        ? (((settled[0].value || {}).items || [])
          .map(spotifyTrackToResult)
          .filter(Boolean))
        : [],
    recent:
      settled[1].status === "fulfilled"
        ? (((settled[1].value || {}).items || [])
          .map((entry) => spotifyTrackToResult(entry && entry.track))
          .filter(Boolean))
        : [],
    saved:
      settled[2].status === "fulfilled"
        ? (((settled[2].value || {}).items || [])
          .map((entry) => spotifyTrackToResult(entry && entry.track))
          .filter(Boolean))
        : [],
  };
  spotifyPersonalCache = {
    expires: Date.now() + 5 * 60 * 1000,
    payload,
    pending: null,
  };
  return payload;
}

async function searchSpotifyTracksForVoice(query, limit = 10) {
  const q = String(query || "").trim(),
    take = Math.max(1, Math.min(10, Math.round(Number(limit) || 10))),
    key = `spotify:${q.toLocaleLowerCase("vi")}`,
    cached = musicSearchCache.get(key);
  if (!q) throw new Error("Thiếu nội dung tìm kiếm Spotify");
  if (cached && cached.expires > Date.now())
    return (cached.payload.results || []).slice(0, take);
  const data = await spotifyApi("/search", {
    query: { q, type: "track", limit: Math.max(take, 10) },
  }),
    results = (((data || {}).tracks || {}).items || [])
      .map(spotifyTrackToResult)
      .filter(Boolean);
  boundedCacheSet(
    musicSearchCache,
    key,
    {
      expires: Date.now() + 5 * 60 * 1000,
      payload: { query: q, results, source: "spotify" },
    },
    120,
  );
  return results.slice(0, take);
}

async function getConfiguredNewsForVoice(limit) {
  const take = Math.max(1, Math.min(20, Math.round(Number(limit) || 8)));
  if (newsCache.items.length && newsCache.expires > Date.now())
    return newsCache.items.slice(0, take).map((item) => ({
      ...item,
      url: item.url || item.link || "",
    }));
  const feed = await rssParser.parseURL(NEWS_RSS_URL);
  const items = (feed.items || [])
    .slice(0, Math.max(take, NEWS_LIMIT))
    .map((entry, index) => {
      const split = splitNewsPublisher(entry.title || "", feed.title || "Tin tức");
      return {
        id: String(entry.guid || entry.id || index),
        title: split.title,
        source: split.source,
        link: safePublicMediaUrl(entry.link),
        publishedAt: String(entry.isoDate || entry.pubDate || ""),
        summary: cleanExternalText(entry.contentSnippet || entry.summary || "", 500),
        image: safePublicMediaUrl(
          (entry.enclosure && entry.enclosure.url) ||
          firstHtmlImage(entry.content || entry.contentSnippet || ""),
        ),
      };
    })
    .filter((entry) => entry.title);
  const enriched = await enrichNewsItems(items, NEWS_IMAGE_ENRICH_LIMIT);
  newsCache = { expires: Date.now() + 5 * 60 * 1000, items: enriched };
  return enriched.slice(0, take).map((item) => ({
    ...item,
    url: item.url || item.link || "",
  }));
}

async function executeVoiceTool(name, args, context) {
  args = args && typeof args === "object" ? args : {};
  if (name === "get_weather") return await getVoiceWeather(args.location);
  if (name === "get_ambient_context") {
    const current = routeCoordinate(context && context.currentLocation),
      fallback = routeCoordinate({
        latitude: FRAME_LATITUDE,
        longitude: FRAME_LONGITUDE,
      }),
      coords = current || fallback;
    if (!coords)
      throw new Error(
        "Không có vị trí hiện tại; hãy bật quyền vị trí hoặc cấu hình tọa độ frame",
      );
    return {
      kind: "ambient-context",
      ...(await buildAmbientContext(coords.latitude, coords.longitude)),
    };
  }
  if (name === "get_directions")
    return await getVoiceDirections(
      args,
      context && typeof context === "object" ? context : {},
    );
  if (name === "show_recipe") {
    const ingredients = normalizeRecipeList(args.ingredients, "ingredient", 30),
      steps = normalizeRecipeList(args.steps, "step", 20),
      tips = normalizeRecipeList(args.tips, "tip", 10);
    if (!ingredients.length)
      throw new Error("Công thức thiếu danh sách nguyên liệu");
    if (!steps.length)
      throw new Error("Công thức thiếu nội dung các bước thực hiện");
    return {
      kind: "recipe",
      title: cleanExternalText(args.title || "Công thức", 220),
      summary: cleanExternalText(args.summary || "", 500),
      timeMinutes: Math.max(
        0,
        Math.min(1440, Math.round(Number(args.timeMinutes) || 0)),
      ),
      servings: Math.max(
        0,
        Math.min(100, Math.round(Number(args.servings) || 0)),
      ),
      ingredients,
      steps,
      tips,
    };
  }
  if (name === "add_alarm") {
    let relativeMinutes = Math.round(Number(args.relativeMinutes) || 0);
    if (!relativeMinutes)
      relativeMinutes = relativeAlarmMinutes(context && context.userText);
    const target = relativeMinutes
      ? frameAlarmTarget(Math.max(1, Math.min(7 * 24 * 60, relativeMinutes)))
      : { time: args.time, scheduledDate: "" };
    const item = createAlarmRecord({
      time: target.time,
      scheduledDate: target.scheduledDate,
      label: args.label || "Báo thức giọng nói",
      repeatDays: Array.isArray(args.repeatDays) ? args.repeatDays : [],
      confirmCount: args.confirmCount || 1,
      enabled: true,
    });
    const items = readAlarmsFile();
    items.push(item);
    writeAlarmsFile(items);
    noteRemoteCommand("add_alarm", { alarmId: item.id });
    recordFrameNotification({
      id: `alarm:created:${item.id}`,
      type: "alarm",
      priority: 48,
      title: `Đã đặt báo thức ${item.time}`,
      body: `${item.label} · ${repeatDaysText(item.repeatDays)}`,
      icon: "alarm",
      action: "open-alarms",
    });
    return {
      kind: "action",
      ok: true,
      message: `Đã đặt báo thức lúc ${item.time}`,
      alarm: item,
    };
  }
  if (name === "dismiss_alarm") {
    remoteDismissVersion++;
    remoteDismissId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex");
    noteRemoteCommand("dismiss_alarm", {
      dismissVersion: remoteDismissVersion,
      dismissId: remoteDismissId,
    });
    return { kind: "action", ok: true, message: "Đã tắt báo thức đang reo" };
  }
  if (name === "manage_alarms") {
    const action = String(args.action || "list"),
      items = readAlarmsFile();
    if (action === "list")
      return {
        kind: "alarms",
        ok: true,
        items: items.sort((a, b) => String(a.time).localeCompare(String(b.time))),
        message: `Có ${items.length} báo thức`,
      };
    const id = String(args.id || "").trim(),
      index = items.findIndex((item) => String(item.id) === id);
    if (!id) throw new Error("Thiếu id báo thức; hãy gọi manage_alarms action list trước");
    if (index < 0) throw new Error("Không tìm thấy báo thức");
    if (action === "delete") {
      const removed = items[index];
      items.splice(index, 1);
      writeAlarmsFile(items);
      noteRemoteCommand("delete_alarm", { alarmId: id });
      return {
        kind: "action",
        ok: true,
        message: `Đã xóa báo thức ${removed.time} ${removed.label || ""}`.trim(),
      };
    }
    if (!["enable", "disable", "update"].includes(action))
      throw new Error("Thao tác báo thức không hợp lệ");
    const changes = action === "enable"
      ? { enabled: true }
      : action === "disable"
        ? { enabled: false }
        : {
          ...(args.time !== undefined ? { time: args.time } : {}),
          ...(args.label !== undefined ? { label: args.label } : {}),
          ...(args.repeatDays !== undefined
            ? { repeatDays: args.repeatDays }
            : {}),
          ...(args.confirmCount !== undefined
            ? { confirmCount: args.confirmCount }
            : {}),
        },
      data = cleanAlarmInput(changes, items[index]);
    items[index] = {
      ...items[index],
      ...data,
      lastTriggeredDate: "",
      updatedAt: new Date().toISOString(),
    };
    writeAlarmsFile(items);
    noteRemoteCommand(data.enabled ? "enable_alarm" : "disable_alarm", {
      alarmId: id,
    });
    return {
      kind: "action",
      ok: true,
      alarm: items[index],
      message: `Đã cập nhật báo thức ${items[index].time}`,
    };
  }
  if (name === "manage_notifications") {
    const action = String(args.action || "list");
    if (action === "list") {
      const payload = activeFrameNotifications();
      return {
        kind: "notifications",
        ok: true,
        ...payload,
        message: `Có ${payload.items.length} thông báo`,
      };
    }
    if (action === "create") {
      const item = cleanFrameNotification({
        type: "assistant",
        title: args.title || "Thông báo từ trợ lý",
        body: args.body || "",
        priority: args.priority,
        icon: "assistant",
      });
      upsertFrameNotifications(item);
      return { kind: "action", ok: true, item, message: "Đã tạo thông báo" };
    }
    const state = readFrameState();
    if (action === "read_all") {
      const now = new Date().toISOString();
      state.notifications = state.notifications.map((item) =>
        item.dismissedAt || item.readAt ? item : { ...item, readAt: now },
      );
      writeFrameState(state);
      return { kind: "action", ok: true, message: "Đã đánh dấu tất cả là đã đọc" };
    }
    const id = String(args.id || "").trim(),
      item = state.notifications.find((entry) => String(entry.id) === id);
    if (!id) throw new Error("Thiếu id thông báo");
    if (!item) throw new Error("Không tìm thấy thông báo");
    if (action === "read") item.readAt = item.readAt || new Date().toISOString();
    else if (action === "dismiss") item.dismissedAt = new Date().toISOString();
    else throw new Error("Thao tác thông báo không hợp lệ");
    writeFrameState(state);
    return {
      kind: "action",
      ok: true,
      message: action === "read" ? "Đã đánh dấu thông báo là đã đọc" : "Đã bỏ thông báo",
    };
  }
  if (name === "get_frame_status") {
    const config = readFrameConfig(),
      primary =
        config &&
        config.theme &&
        (config.theme.primaryColor || config.theme.primary);
    return {
      kind: "frame-status",
      ok: true,
      ...remoteStatusPayload(),
      config: {
        timezone: FRAME_TIMEZONE,
        themeVariables: buildThemeVariables(primary),
        timing: {
          ambientRefreshMs: AMBIENT_CONTEXT_REFRESH_MS,
          photoIntervalMs: FRAME_PHOTO_INTERVAL_MS,
          poolRefreshMs: FRAME_POOL_REFRESH_MS,
          newsRefreshMs: FRAME_NEWS_REFRESH_MS,
        },
      },
    };
  }
  if (name === "control_frame") {
    const action = String(args.action || "").trim(),
      allowed = [
        "navigate",
        "close_page",
        "back",
        "idle",
        "reload",
        "stop_assistant",
        "retry_context",
        "retry_calendar",
        "retry_camera",
        "show_message",
      ];
    if (!allowed.includes(action)) throw new Error("Thao tác màn hình không hợp lệ");
    if (!remoteStatusPayload().online) throw new Error("Màn hình đang offline");
    const extra = {};
    if (action === "navigate") {
      const view = String(args.view || "");
      if (!["home", "today", "media", "news", "alarm"].includes(view))
        throw new Error("Thiếu hoặc sai tab cần mở");
      extra.view = view;
    }
    if (action === "show_message") {
      extra.title = cleanExternalText(args.title || "Tin nhắn từ trợ lý", 160);
      extra.text = cleanExternalText(args.text || "", 2000);
      if (!extra.text) throw new Error("Thiếu nội dung cần hiển thị");
    }
    if (action === "retry_context") ambientContextCache.clear();
    if (action === "retry_calendar") {
      calendarCache.expires = 0;
      ambientContextCache.clear();
    }
    const command = noteRemoteCommand(action, extra);
    return { kind: "action", ok: true, command, message: `Đã gửi lệnh ${action}` };
  }
  if (name === "spotify_control") {
    const action = String(args.action || "");
    if (action === "seek") {
      const positionSeconds = Number(args.positionSeconds);
      if (!Number.isFinite(positionSeconds) || positionSeconds < 0)
        throw new Error("Thiếu vị trí cần tua, tính bằng giây");
      await spotifyApi("/me/player/seek", {
        method: "PUT",
        query: { position_ms: Math.round(positionSeconds * 1000) },
      });
      spotifyPlayerCacheVersion++;
      spotifyPlayerCache.expires = 0;
      return {
        kind: "action",
        ok: true,
        spotify: true,
        message: `Đã tua tới ${Math.round(positionSeconds)} giây`,
      };
    }
    if (action === "shuffle_on" || action === "shuffle_off") {
      const state = action === "shuffle_on";
      await spotifyApi("/me/player/shuffle", {
        method: "PUT",
        query: { state },
      });
      spotifyPlayerCacheVersion++;
      spotifyPlayerCache.expires = 0;
      return {
        kind: "action",
        ok: true,
        spotify: true,
        message: state ? "Đã bật phát ngẫu nhiên" : "Đã tắt phát ngẫu nhiên",
      };
    }
    if (["repeat_off", "repeat_context", "repeat_track"].includes(action)) {
      const state = action.replace("repeat_", "");
      await spotifyApi("/me/player/repeat", {
        method: "PUT",
        query: { state },
      });
      spotifyPlayerCacheVersion++;
      spotifyPlayerCache.expires = 0;
      return {
        kind: "action",
        ok: true,
        spotify: true,
        message:
          state === "off"
            ? "Đã tắt lặp lại"
            : state === "track"
              ? "Đã lặp lại bài hiện tại"
              : "Đã lặp lại danh sách hiện tại",
      };
    }
    if (["volume", "volume_up", "volume_down"].includes(action)) {
      let volumePercent;

      if (action === "volume") {
        const rawVolume = args.volumePercent;
        if (
          rawVolume === undefined ||
          rawVolume === null ||
          rawVolume === "" ||
          !Number.isFinite(Number(rawVolume))
        )
          throw new Error("Thiếu mức âm lượng Spotify từ 0 đến 100");
        volumePercent = Math.max(
          0,
          Math.min(100, Math.round(Number(rawVolume))),
        );
      } else {
        const state = await spotifyApi("/me/player");
        const currentVolume = Number(
          state && state.device && state.device.volume_percent,
        );
        if (!Number.isFinite(currentVolume))
          throw new Error(
            "Không lấy được âm lượng hiện tại; hãy mở Spotify trên một thiết bị trước",
          );

        const requestedStep = Number(args.step);
        const step = Number.isFinite(requestedStep)
          ? Math.max(1, Math.min(50, Math.round(requestedStep)))
          : 10;
        volumePercent = Math.max(
          0,
          Math.min(
            100,
            currentVolume + (action === "volume_up" ? step : -step),
          ),
        );
      }

      await spotifyApi("/me/player/volume", {
        method: "PUT",
        query: { volume_percent: volumePercent },
      });
      spotifyPlayerCacheVersion++;
      spotifyPlayerCache = {
        expires: 0,
        payload: spotifyPlayerCache.payload,
        pending: null,
      };
      return {
        kind: "action",
        ok: true,
        spotify: true,
        volumePercent,
        message: `Đã đặt âm lượng Spotify ở mức ${volumePercent}%`,
      };
    }

    const map = {
      play: ["/me/player/play", "PUT", "Đã tiếp tục phát Spotify"],
      pause: ["/me/player/pause", "PUT", "Đã tạm dừng Spotify"],
      next: ["/me/player/next", "POST", "Đã chuyển sang bài tiếp theo"],
      previous: ["/me/player/previous", "POST", "Đã quay lại bài trước"],
    };
    if (!map[action]) throw new Error("Spotify action không hợp lệ");
    await spotifyApi(map[action][0], { method: map[action][1] });
    spotifyPlayerCacheVersion++;
    spotifyPlayerCache = {
      expires: 0,
      payload: spotifyPlayerCache.payload,
      pending: null,
    };
    return {
      kind: "action",
      ok: true,
      spotify: true,
      message: map[action][2],
    };
  }
  if (name === "spotify_search") {
    const q = String(args.query || "").trim();
    const results = await searchSpotifyTracksForVoice(q, 10);
    return {
      kind: "spotify-search",
      ok: true,
      query: q,
      results,
      message: results.length
        ? `Tìm thấy ${results.length} bài hát`
        : "Không tìm thấy bài hát phù hợp",
    };
  }
  if (name === "spotify_play_search") {
    const q = String(args.query || "").trim();
    const track = (await searchSpotifyTracksForVoice(q, 5))[0];
    if (!track) throw new Error("Không tìm thấy bài hát");
    await spotifyApi("/me/player/play", {
      method: "PUT",
      body: { uris: [track.uri] },
    });
    spotifyPlayerCacheVersion++;
    spotifyPlayerCache = {
      expires: 0,
      payload: spotifyPlayerCache.payload,
      pending: null,
    };
    return {
      kind: "action",
      ok: true,
      spotify: true,
      message: `Đang phát ${track.title}`,
      track,
    };
  }
  if (name === "spotify_queue_search") {
    const q = String(args.query || "").trim();
    const track = (await searchSpotifyTracksForVoice(q, 5))[0];
    if (!track) throw new Error("Không tìm thấy bài hát");
    await spotifyApi("/me/player/queue", {
      method: "POST",
      query: { uri: track.uri },
    });
    return {
      kind: "action",
      ok: true,
      spotify: true,
      track,
      message: `Đã thêm ${track.title} vào hàng đợi`,
    };
  }
  if (name === "spotify_library") {
    const library = await getSpotifyLibraryForVoice();
    return {
      kind: "spotify-library",
      ok: true,
      ...library,
      message: `Có ${library.top.length} top tracks, ${library.recent.length} bài gần đây và ${library.saved.length} bài đã lưu`,
    };
  }
  if (name === "spotify_devices") {
    const devices = await getSpotifyDevicesForVoice();
    if (!devices.length)
      throw new Error(
        "Không tìm thấy thiết bị Spotify; hãy mở Spotify trên thiết bị cần sử dụng",
      );
    const active = devices.find((device) => device.isActive);
    return {
      kind: "spotify-devices",
      ok: true,
      devices,
      activeDeviceId: active ? active.id : "",
      message: active
        ? `Có ${devices.length} thiết bị Spotify; ${active.name} đang hoạt động`
        : `Có ${devices.length} thiết bị Spotify nhưng chưa có thiết bị đang hoạt động`,
    };
  }
  if (name === "spotify_connection_status")
    return {
      kind: "spotify-status",
      ok: true,
      configured: spotifyConfigured(),
      connected: !!(spotifyTokens && spotifyTokens.refreshToken),
      deviceName: SPOTIFY_DEVICE_NAME,
      rateLimited: spotifyRateLimitUntil > Date.now(),
      rateLimitedUntil: spotifyRateLimitUntil || 0,
      retryAfterSeconds:
        spotifyRateLimitUntil > Date.now()
          ? Math.max(1, Math.ceil((spotifyRateLimitUntil - Date.now()) / 1000))
          : 0,
      reauthorizeBy:
        spotifyTokens && spotifyTokens.authorizedAt
          ? spotifyTokens.authorizedAt + 183 * 24 * 60 * 60 * 1000
          : 0,
    };
  if (name === "spotify_now_playing") {
    let playback;
    if (
      spotifyPlayerCache.payload &&
      (spotifyPlayerCache.expires > Date.now() ||
        spotifyRateLimitUntil > Date.now())
    )
      playback = spotifyPlayerCache.payload;
    else if (spotifyPlayerCache.pending)
      playback = await spotifyPlayerCache.pending;
    else {
      const state = await spotifyApi("/me/player");
      playback = spotifyPlayerStateToPayload(state);
      spotifyPlayerCache = {
        expires: Date.now() + 10000,
        payload: playback,
        pending: null,
      };
    }
    const clientSpotify =
      context && context.clientSpotify && typeof context.clientSpotify === "object"
        ? context.clientSpotify
        : {},
      track = playback && playback.item,
      device = playback && playback.device,
      wasPlaying = !!clientSpotify.wasPlaying,
      isPlaying = !!(playback && playback.isPlaying) || wasPlaying;
    return {
      kind: "spotify-now-playing",
      ok: true,
      active: !!(playback && playback.active),
      isPlaying,
      progressMs: Math.max(0, Number((playback && playback.progressMs) || 0)),
      track: track || null,
      device: device || null,
      message: track
        ? `${isPlaying ? "Đang phát" : "Đang tạm dừng"} ${track.title}${track.artist ? ` của ${track.artist}` : ""
        }${device && device.name ? ` trên ${device.name}` : ""}`
        : "Spotify hiện không phát nội dung nào",
    };
  }
  if (name === "spotify_transfer" || name === "spotify_select_player") {
    const requestedId = String(args.deviceId || "").trim();
    const requestedName = String(args.deviceName || "").trim();
    if (!requestedId && !requestedName)
      throw new Error("Chưa chọn thiết bị Spotify cần chuyển sang");

    const [devices, playerState] = await Promise.all([
      getSpotifyDevicesForVoice(),
      spotifyApi("/me/player"),
    ]);
    if (!devices.length)
      throw new Error(
        "Không tìm thấy thiết bị Spotify; hãy mở Spotify trên thiết bị cần sử dụng",
      );

    let matches = [];
    if (requestedId)
      matches = devices.filter((device) => device.id === requestedId);
    else {
      const query = requestedName.toLocaleLowerCase("vi");
      matches = devices.filter(
        (device) => device.name.toLocaleLowerCase("vi") === query,
      );
      if (!matches.length)
        matches = devices.filter((device) =>
          device.name.toLocaleLowerCase("vi").includes(query),
        );
    }

    if (!matches.length)
      throw new Error(
        `Không tìm thấy thiết bị “${requestedName || requestedId}”. Thiết bị hiện có: ${devices
          .map((device) => device.name)
          .join(", ")}`,
      );
    if (matches.length > 1)
      throw new Error(
        `Có nhiều thiết bị khớp tên: ${matches
          .map((device) => device.name)
          .join(", ")}. Hãy chọn tên cụ thể hơn`,
      );

    const target = matches[0];
    if (target.isRestricted)
      throw new Error(`Thiết bị ${target.name} không cho phép điều khiển từ xa`);

    const currentDeviceId = String(
      playerState && playerState.device && playerState.device.id
        ? playerState.device.id
        : "",
    );
    const isPlaying =
      !!(playerState && playerState.is_playing) ||
      !!(
        context &&
        context.clientSpotify &&
        context.clientSpotify.wasPlaying
      );
    if (target.id !== currentDeviceId) {
      await spotifyApi("/me/player", {
        method: "PUT",
        body: { device_ids: [target.id], play: isPlaying },
      });
    }

    spotifyPlayerCacheVersion++;
    spotifyPlayerCache = {
      expires: 0,
      payload: spotifyPlayerCache.payload,
      pending: null,
    };
    spotifyDevicesCache = { expires: 0, payload: null, pending: null };
    return {
      kind: "action",
      ok: true,
      spotify: true,
      device: target,
      continuedPlaying: isPlaying,
      message:
        target.id === currentDeviceId
          ? `Spotify đã ở trên ${target.name}`
          : `Đã chuyển Spotify sang ${target.name}${isPlaying ? " và tiếp tục phát" : ""
          }`,
    };
  }
  if (name === "get_calendar") {
    const c = await getCalendarEvents(true);
    return {
      kind: "calendar",
      name: c.name || FRAME_CALENDAR_NAME,
      events: (c.events || []).slice(0, 8),
    };
  }
  if (name === "list_routines") {
    const routineContext = await getRoutineAmbientContext(
      context && context.currentLocation
        ? context.currentLocation
        : {},
    );
    return {
      kind: "routines",
      ok: true,
      items: routineDefinitions(routineContext),
    };
  }
  if (name === "get_morning_briefing") {
    const routineContext = await getRoutineAmbientContext(
      context && context.currentLocation
        ? context.currentLocation
        : {},
    );
    return buildMorningBriefing(routineContext);
  }
  if (name === "get_news_feed") {
    const items = await getConfiguredNewsForVoice(args.limit);
    return {
      kind: "news-search",
      title: "Tin mới nhất",
      subtitle: "Nguồn RSS đã cấu hình trên frame",
      items,
    };
  }
  if (name === "get_lyrics") {
    const title = cleanExternalText(args.title, 200),
      artist = cleanExternalText(args.artist, 200),
      album = cleanExternalText(args.album, 250),
      duration = Math.max(0, Math.min(3600, Number(args.durationSeconds) || 0));
    if (!title || !artist) throw new Error("Cần tên bài hát và nghệ sĩ");
    let lyrics = await lookupLrclib({ title, artist, album, duration });
    if (!lyrics) lyrics = await lookupLyricsOvh({ title, artist });
    return {
      kind: "lyrics",
      ok: !!lyrics,
      found: !!lyrics,
      title,
      artist,
      album,
      ...(lyrics || { timed: false, source: null, lines: [] }),
      message: lyrics ? `Đã tìm thấy lời ${title}` : `Không tìm thấy lời ${title}`,
    };
  }
  if (name === "get_camera_status") {
    const status = remoteStatusPayload();
    return {
      kind: "camera-status",
      ok: true,
      configured: !!CAMERA_REMOTE_TOKEN,
      secureContextRequired: true,
      frameOnline: status.online,
      cameraState: status.frame.cameraState || "unknown",
      viewerUrl: "/camera",
    };
  }
  if (name === "run_routine") {
    const id = String(args.routine || "").trim();
    if (!["morning", "leaving", "day-check", "evening"].includes(id))
      throw new Error("Thói quen không hợp lệ");
    const currentLocation =
      context && context.currentLocation && typeof context.currentLocation === "object"
        ? context.currentLocation
        : {};
    const routineContext = await getRoutineAmbientContext(currentLocation);
    return buildRoutineDisplay(id, routineContext);
  }
  if (name === "search_news")
    return await searchVoiceNews(args.query, args.limit);
  if (name === "web_search")
    return await searchVoiceWeb(args.query, args.limit);
  if (name === "lookup_person") return await lookupVoicePerson(args.query);
  if (name === "show_info")
    return {
      kind: "info",
      title: String(args.title || "Thông tin"),
      subtitle: String(args.subtitle || ""),
      items: (Array.isArray(args.items) ? args.items : [])
        .slice(0, 12)
        .map((x) => ({
          label: String((x && x.label) || ""),
          value: String((x && x.value) || ""),
          detail: String((x && x.detail) || ""),
        })),
    };
  if (name === "request_followup") {
    const question = String(args.question || "").trim();
    if (!question) throw new Error("Thiếu câu hỏi follow-up");
    return { kind: "followup", ok: true, question: question.slice(0, 500) };
  }
  if (name === "render_dynamic_ui") {
    const allowedTypes = new Set([
      "hero",
      "image",
      "profile",
      "text",
      "stats",
      "facts",
      "chips",
      "list",
      "timeline",
      "news",
      "weather",
      "forecast",
      "sources",
      "gallery",
      "calendar",
      "recipe",
      "callout",
    ]);
    const allowedEmphasis = new Set(["hero", "normal", "subtle"]);
    const cleanText = (v, max = 1200) =>
      String(v == null ? "" : v)
        .trim()
        .slice(0, max);
    const cleanUrl = (v) => safePublicMediaUrl(cleanText(v, 1600));
    const cleanItem = (x) => ({
      label: cleanText(x && x.label, 100),
      value: cleanText(x && x.value, 300),
      detail: cleanText(x && x.detail, 700),
      title: cleanText(x && x.title, 220),
      subtitle: cleanText(x && x.subtitle, 300),
      text: cleanText(x && x.text, 900),
      url: cleanUrl(x && (x.url || x.href || x.link)),
      image: cleanUrl(x && x.image),
      icon: cleanText(x && x.icon, 40),
      time: cleanText(x && x.time, 80),
      date: cleanText(x && x.date, 80),
      source: cleanText(x && x.source, 140),
    });
    const widgets = (Array.isArray(args.widgets) ? args.widgets : [])
      .slice(0, 10)
      .map((w, i) => ({
        type: allowedTypes.has(String((w && w.type) || ""))
          ? String(w.type)
          : "text",
        span: Math.max(1, Math.min(12, Math.round(Number(w && w.span) || 12))),
        order: Math.max(
          0,
          Math.min(100, Math.round(Number(w && w.order) || i)),
        ),
        emphasis: allowedEmphasis.has(String((w && w.emphasis) || ""))
          ? String(w.emphasis)
          : "normal",
        title: cleanText(w && w.title, 220),
        subtitle: cleanText(w && w.subtitle, 360),
        text: cleanText(w && w.text, 1800),
        value: cleanText(w && w.value, 500),
        image: cleanUrl(w && w.image),
        url: cleanUrl(w && (w.url || w.href || w.link)),
        icon: cleanText(w && w.icon, 40),
        items: (Array.isArray(w && w.items) ? w.items : [])
          .slice(0, 20)
          .map(cleanItem),
      }))
      .sort((a, b) => a.order - b.order);
    const rawLayout =
      args.layout && typeof args.layout === "object" ? args.layout : {};
    const density = ["compact", "comfortable", "spacious"].includes(
      String(rawLayout.density || ""),
    )
      ? String(rawLayout.density)
      : "comfortable";
    return {
      kind: "dynamic_ui",
      kicker: cleanText(args.kicker || "Trợ lý Nest", 100),
      title: cleanText(args.title || "Thông tin", 220),
      subtitle: cleanText(args.subtitle, 500),
      layout: {
        columns: Math.max(
          1,
          Math.min(12, Math.round(Number(rawLayout.columns) || 12)),
        ),
        gap: Math.max(0, Math.min(32, Math.round(Number(rawLayout.gap) || 14))),
        density,
      },
      widgets,
    };
  }
  throw new Error("Công cụ giọng nói không xác định");
}

