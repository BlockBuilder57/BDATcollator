// largely copied from https://www.geeksforgeeks.org/generate-passwords-given-character-set/#

// C++ program to generate all passwords for given characters
#include <cstring>
#include <cstdio>
#include <iostream>
#include <string>
#include <cassert>
#include <thread>
#include <vector>

#include "murmur3.h"
 
// int cnt;
 
char arr[] = {
  'A', 'B', 'C', 'D', 'E', 'F',
  'G', 'H', 'I', 'J', 'K', 'L',
  'M', 'N', 'O', 'P', 'Q', 'R',
  'S', 'T', 'U', 'V', 'W', 'X',
  'Y', 'Z', '_'/*, '0', '1', '2',
  '3', '4', '5', '6', '7', '8',
  '9'*/
};
int len = sizeof(arr) / sizeof(arr[0]);

unsigned int funny = {};

std::vector<std::thread> threads;

// Recursive helper function, adds/removes characters
// until len is reached
void generate(char* arr, int i, std::string s)
{
    // base case
    if (i == 0) // when len has been reached
    {
        // prefix (not just for looks)
        s = "OBJLIST_CRAFT_" + s;
        //s = "PC_" + s;
        MurmurHash3_x86_32(s.c_str(), s.size(), 0, &funny);

        // match a certain hash
        if (funny == 0x5217EA61) {
            std::cout << ">+: " << s << '\n';
            //assert(false && "found it");
        }
        // cnt++;
        return;
    }
 
    // iterate through the array
    for (int j = 0; j < len; j++) {
 
        // Create new string with next character
        // Call generate again until string has
        // reached its len
        std::string appended = s + arr[j];
        generate(arr, i - 1, appended);
    }

    return;
}
 
// function to generate all possible passwords
void crack(char* arr, int size)
{
    // call for all required lengths
    for (int i = 1; i <= size; i++) {
        generate(arr, i, "");
        std::cout << "ending thread " << i << '\n';
        //threads.push_back(std::thread(generate, arr, i, ""));
    }

    int count = 1;
    for (auto &th : threads) {
        th.join();
        std::cout << "ending thread " << count++ << '\n';
    }
}
 
// driver function
int main()
{
    crack(arr, 7);
 
    //cout << cnt << endl;
    return 0;
}
