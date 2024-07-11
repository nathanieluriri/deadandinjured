import random as rd
class pace:
    def random_guesses(self):
        
        set_of_string = [0,1,2,3,4,5,6,7,8,9]
        guess= rd.sample(set_of_string,4)
        return guess

    def accurate_guesses(self,Zero):
        set_of_string = [0,1,2,3,4,5,6,7,8,9]
        set_of_string_in_set = set(set_of_string)  
        guess_from = set_of_string_in_set-Zero
        guess_from = list(guess_from)
        guess = rd.sample(guess_from,4)
        return guess
    

