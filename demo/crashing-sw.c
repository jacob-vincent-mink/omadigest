#include <stdio.h>

static void crash_in_release_parser(void) {
  volatile int *missing_release = NULL;
  *missing_release = 42;
}

int main(void) {
  puts("crashing-sw: simulating a release parser crash");
  fflush(stdout);
  crash_in_release_parser();
  return 0;
}
