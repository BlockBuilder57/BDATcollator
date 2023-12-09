Sheet links are the way that we connect data in BDATs. They do not have a concept of links per-se, all data is fetched and stiched together by the game. So, all of that stitching (and the many ways it is done) has to be thought about ahead of time. So, a robust system for linking sheets is in place.

A sheet linking file has a very basic structure:
- `templates` - a list of templated behaviors, such as items in 2.
- `localizations` - a simplified list of localization links.
- `links` - the normal list of links.

Links are very simple on their own, and have a few variables:
- `src` - the source sheet for a link. For example, `/fld.bdat#FLD_NpcResource`.
- `src_column` - the column of the source sheet we want to link against.
- `target` - the target sheet for a link. For example, `/sys.bdat#CHR_PC`.
- `target_column` - the column of the target sheet we are getting the value from.
- `target_column_display` - the column of the target sheet that will be used for display. In many cases, this is "Name" so a name is displayed when "$id" is used in `target_column`.
- `template` - specifies which template to use for extra variables.
- `ignore_zero_values` - ignores the skipping of zero values. In most cases 0 is an empty value, but not for all.
- `value_offset` - defines an offset for number values.

`src` can be a regular expression, denoted by the start and end of the string being a `/`. This creates a many-to-many relationship between the source and target sheets. Up to 3 selection groups can be chosen, and then used in the target sheet/column with `$S1`-`$S3`. `src_column` is a similar story, where multiple columns can be selected, and matches are exposed as `$C0`-`$C3`, where `$C0` is just the column name.

Links have a few kinds of critera:
- `src_column_above` - takes a `column` and `value` to compare.
- `src_column_below` - takes a `column` and `value` to compare.
- `src_column_equals` - takes a `column` and `value` to compare.
- `src_column_between` - takes a `column`, `above`, and `below` to compare.