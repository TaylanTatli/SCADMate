export const SAMPLE_SOURCE = `/* [Enclosure] */
case_width = 118; // [90:160]
case_height = 74; // [55:110]
case_depth = 22; // [16:40]
wall = 2.4; // [1.6:0.2:4]
corner_radius = 5; // [2:10]
show_vents = true;
accent = "amber"; // [amber, graphite, natural]

/* [Display] */
display_width = 96;
display_height = 55;
bezel = 3.5; // [2:0.5:8]

/* [Hidden] */
$fn = 40;

module rounded_box(size, radius) {
  hull() {
    for (x = [radius, size[0] - radius])
      for (y = [radius, size[1] - radius])
        translate([x, y, 0]) cylinder(h = size[2], r = radius);
  }
}

module shell() {
  difference() {
    rounded_box([case_width, case_height, case_depth], corner_radius);
    translate([wall, wall, wall])
      rounded_box(
        [case_width - 2 * wall, case_height - 2 * wall, case_depth],
        max(1, corner_radius - wall)
      );

    // 4.3-inch display opening
    translate([
      (case_width - display_width) / 2,
      (case_height - display_height) / 2,
      -0.1
    ])
      cube([display_width, display_height, wall + 0.2]);

    // Two USB openings
    for (x = [case_width / 2 - 18, case_width / 2 + 8])
      translate([x, -0.1, 8])
        cube([12, wall + 0.2, 7]);

    if (show_vents)
      for (x = [18:8:case_width - 18])
        translate([x, case_height - wall - 0.1, 7])
          cube([3, wall + 0.2, 8]);
  }
}

module screw_posts() {
  for (x = [10, case_width - 10])
    for (y = [10, case_height - 10])
      translate([x, y, wall])
        difference() {
          cylinder(h = 7, r = 4.2);
          translate([0, 0, -0.1]) cylinder(h = 7.2, r = 1.3);
        }
}

union() {
  shell();
  screw_posts();
}
`;
