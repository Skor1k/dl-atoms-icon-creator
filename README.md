# [DL Atoms] Icon Creator

Figma-плагин, который превращает обычные SVG-векторы в готовый icon component set с вариантами по размерам и стилям — в один клик.

**[Установить из Figma Community](https://www.figma.com/community/plugin/1639703807397023804)**

---

## Что делает плагин

### Создание нового Component Set

Выделите контурный и заливной SVG-вектор на канвасе — плагин соберёт **component set** с:

- Вариантами по размерам **24 / 20 / 16 / 12 / 8** (плюс любые свои)
- Произвольными boolean/string-пропсами (`Filled = true/false`, `Style = solid/outline`, и т.д.)
- Правильной структурой каждого варианта (иконка + Container Size)
- Опциональной перекраской в стиль `UI/icon/icon-gray-main` из подключённой библиотеки

### Редактирование существующего Component Set

Выделите готовый **component set** на канвасе — плагин переключится в режим редактирования, где можно:

- **Добавить новые размеры** в уже существующий сет (через кнопку `+`)
- **Удалить ненужные размеры** (кнопкой `×` на чипе размера)

Новые варианты создаются клонированием существующего Size=24 с масштабированием — точно так же, как при создании с нуля. Цвет и стиль иконки наследуются из оригинала автоматически.

---

## Установка

### Development-режим (для разработки и тестирования)

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/your-org/dl-atoms-icon-creator.git
   ```
2. В Figma Desktop: **Plugins → Development → Import plugin from manifest…**
3. Выберите файл `manifest.json` из папки проекта.

### Из Figma Community

Откройте страницу плагина и нажмите **Try it out**:

https://www.figma.com/community/plugin/1639703807397023804

---

## Использование

### Создать новый Component Set

1. **Подготовьте SVG-векторы** на канвасе Figma (например, контурную и заливную версию иконки).
2. Запустите плагин: **Plugins → [DL Atoms] Icon Creator**.
3. **Имя компонента** — введите название, например `Actions / ArrowRightLast`.
4. **Цвет компонента**:
   - `Colorless` — иконка будет перекрашена в стиль `UI/icon/icon-gray-main`
   - `Color` — оригинальные цвета SVG сохранятся
5. **Выделите векторы на канвасе** — они появятся в списке плагина.
6. **Назначьте пропсы каждому варианту** (при 2+ выделенных), например:
   - `Filled = false` для контурной
   - `Filled = true` для заливной
7. **Выберите размеры** — по умолчанию 24, 20, 16, 12, 8. Можно добавить свои через `+`.
8. Нажмите **Создать Component Set**.

Готовый component set появится рядом с исходными векторами.

### Добавить / убрать размеры в существующем Component Set

1. **Выделите component set** на канвасе.
2. Плагин автоматически переключится в режим редактирования — в шапке появится имя сета.
3. **Управляйте размерами**: существующие показаны чипами. Нажмите `×` чтобы убрать, `+` чтобы добавить новый.
4. Нажмите **Обновить Component Set**.

Плагин добавит недостающие варианты (клонируя Size=24 для каждого prop-набора) и удалит убранные.

---

## Структура каждого варианта

```
Component "Size=24, Filled=false"   <- auto-layout vertical, hug, lock aspect ratio
├── Container Size  [24×24, opacity=0, locked]   <- задаёт размер frame
└── Icon            [VectorNode, ABSOLUTE]        <- пропорционально вписан и центрирован
    ├── constraints = SCALE / SCALE
    └── fillStyleId = "UI/icon/icon-gray-main"
```

Для размеров 20 / 16 / 12 / 8 — базовый 24px компонент клонируется и масштабируется через `rescale(size / 24)`, что гарантирует true-пропорциональное уменьшение Icon + Container Size.

Сам component set:
- Vertical auto-layout, hug both axes
- Padding `20`, gap `10`
- Dashed purple stroke `#9747FF` @ 50% opacity

---

## Технические детали

- **Чистый JavaScript** без сборщиков и зависимостей
- 3 файла: `manifest.json`, `code.js`, `ui.html` (с инлайн CSS/JS)
- Использует `documentAccess: "dynamic-page"` и асинхронные API:
  - `figma.getNodeByIdAsync()`
  - `node.setFillStyleIdAsync()`
  - `figma.getStyleByIdAsync()`
  - `figma.getLocalPaintStylesAsync()`
- Стилистика UI — [shadcn/ui](https://ui.shadcn.com/) с поддержкой dark mode и акцентным фиолетовым (`#7A45E5`) в режиме `Color`

---

## Разработка

### Структура файлов

```
[DL Atoms] IconCreator/
├── manifest.json   # Figma plugin manifest
├── code.js         # Plugin sandbox logic (Figma Plugin API)
├── ui.html         # Plugin UI (HTML + inline CSS/JS)
└── README.md       # Этот файл
```

### Внести изменения

1. Отредактируйте `code.js` (логика) или `ui.html` (UI).
2. В Figma: **Plugins → Development → [DL Atoms] Icon Creator** — перезапустите плагин для применения.
3. Hot-reload не требуется — Figma подгружает файлы заново при каждом запуске.

### Ключевые функции `code.js`

| Функция | Назначение |
|---|---|
| `createIconComponentSet(data)` | Создание нового component set из SVG-векторов |
| `createVariantComponent(size, sourceNode, props, styleId)` | Сборка одного варианта (24px база) |
| `updateComponentSet(data)` | Добавление/удаление размеров в существующем component set |
| `sendSelectionToUI()` | PNG-превью выделенных узлов; детектирует COMPONENT_SET |
| `sendComponentSetInfoToUI(cs)` | Читает существующие размеры и отправляет в UI для edit-режима |
| `parseVariantName(name)` | Парсит `"Size=24, Filled=false"` → `{ size, props }` |
| `resolveIconStyle()` | Поиск стиля `UI/icon/icon-gray-main` в библиотеках |
| `applyFillStyle(node, styleId)` | Рекурсивное применение стиля цвета |

---

## Цветовой стиль

По умолчанию иконки перекрашиваются в стиль `UI/icon/icon-gray-main` (#1E242E).

Плагин ищет стиль в:
1. Локальных и импортированных стилях через `getLocalPaintStylesAsync()`
2. Существующих COMPONENT_SET / COMPONENT узлах на текущей странице через `findAllWithCriteria()`

Если стиль не найден — иконки сохранят свои оригинальные цвета.
