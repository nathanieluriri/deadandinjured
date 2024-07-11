import streamlit as st
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
import os
from database import create_game,check_game_already_joined,check_player_created_game,create_gameplay,check_if_player_has_joined,add_choices_to_existing_gameplayc,check_creator_choice_exists,add_choices_to_existing_gameplayj,create_powerup,save_turn_count,get_turn_count,get_game_play_guesses,update_game_play

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv('MONGO_URI')
# Connect to MongoDB
client = MongoClient(MONGO_URI)
db = client.get_database()



if "join_ability" not in st.session_state:
    st.session_state.join_ability= False
if "player_type" not in st.session_state:
    st.session_state.player_type= None

if "UD" not in st.session_state:
    st.session_state.UD= None

if "game_id" not in st.session_state:
    st.session_state.game_id= None
if "games_id" not in st.session_state:
    st.session_state.games_id= None

if "game_play_id" not in st.session_state:
    st.session_state.game_play_id= None
if "connection_status" not in st.session_state:
    st.session_state.connection_status= False
if "rock_paper_scissors" not in st.session_state:
    st.session_state.rock_paper_scissors= None

if "game_started" not in st.session_state:
    st.session_state.game_started=False
if "powerup_object" not in st.session_state:
    st.session_state.powerup_object=None

if "turn_count" not in st.session_state:
    st.session_state.turn_count=0

if 'previous_turn_count' not in st.session_state:
    st.session_state.previous_turn_count =0
if "user_number" not in st.session_state:
    st.session_state.user_number="not set"

if "guess" not in st.session_state:
    st.session_state.guess=0


if "game_updates" not in st.session_state:
    st.session_state.game_updates=[]


@st.experimental_fragment(run_every=3)
def gameUpdates(game_id):

      
    st.session_state.game_updates =(get_game_play_guesses(game_id=game_id))


if st.session_state.UD is None:
    st.switch_page("app.py")

def calculate_dead(PlayersGuess, OpponentsCode):
    """
    Calculate the number of 'dead' values (correct number in the correct position).
    """
    dead = 0
    for i in range(4):
        if PlayersGuess[i] == OpponentsCode[i]:
            dead += 1
    return dead

def calculate_injured(PlayersGuess, OpponentsCode):
    """
    Calculate the number of 'injured' values (correct number in the wrong position).
    """
    injured = 0
    for i in range(4):
        if PlayersGuess[i] != OpponentsCode[i] and PlayersGuess[i] in OpponentsCode:
            injured += 1
    return injured



def get_gameplay_choices(gameplay_id: str):
    """
    Fetches the creator_choice and joiner_choice fields from a specific gameplay document.
    """
    gameplay_collection = db['game_play']  
    query = {'_id': ObjectId(gameplay_id)}
    projection = {'creator_choice': 1, 'joiner_choice': 1, '_id': 0}  # Only include the required fields
    document = gameplay_collection.find_one(query, projection)
    return document

def rock_paper_scissors(player1_choice: str, player2_choice: str) -> str:
    """
    Determines the result of a Rock-Paper-Scissors game.
    
    Args:
    player1_choice (str): The choice of player 1 ('rock', 'paper', or 'scissors').
    player2_choice (str): The choice of player 2 ('rock', 'paper', or 'scissors').
    
    Returns:
    str: 'winner' if player 1 wins, 'loser' if player 1 loses, 'draw' if it's a tie.

    # Example usage

    result = rock_paper_scissors("Rock🪨","Rock🪨")
    """
    valid_choices = ["Rock🪨","Paper📃","Scissors ✂️"]
    
    if player1_choice not in valid_choices or player2_choice not in valid_choices:
        raise ValueError("Choices must be 'rock', 'paper', or 'scissors'")
    
    if player1_choice == player2_choice:
        return 'draw'
    
    winning_combinations = {
        "Rock🪨": "Scissors ✂️",
        'Scissors ✂️': 'Paper📃',
        "Paper📃": "Rock🪨"
    }
    
    if winning_combinations[player1_choice] == player2_choice:
        return 'winner'
    else:
        return 'loser'

def check_even_odd(number: int) -> str:
    """
    Checks whether a given number is even or odd.

    Args:
    number (int): The number to be checked.

    Returns:
    str: 'even' if the number is even, 'odd' if the number is odd.
    
    Raises:
    ValueError: If the input is not an integer.

    # Example usage

    num = 4
    result = check_even_odd(num)
    print(f"The number {num} is {result}.")
    """
    if not isinstance(number, int):
        raise ValueError("The input must be an integer.")
    
    if number % 2 == 0:
        return 'even'
    else:
        return 'odd'
    
def is_multiple_of_10(number: int) -> bool:
    """
    Check if a number is a multiple of 10.

    Args:
        number (int): The number to check.

    Returns:
        bool: True if the number is a multiple of 10, False otherwise.
    """
    return number % 10== 0


@st.experimental_fragment(run_every=1)
def get_gameplayID():
    st.session_state.game_play_id=check_if_player_has_joined(st.session_state.game_id._id)
    if st.session_state.game_play_id is not None:
        st.rerun()

if "counter" not in st.session_state:
    st.session_state.counter=0

@st.experimental_fragment(run_every=1)
def turn_checkj():

    try:
        st.session_state.counter+=1
        st.session_state.turn_count=get_turn_count(ObjectId(st.session_state.games_id))
        st.write(st.session_state.turn_count)
        st.write(st.session_state.counter)
        if st.session_state.previous_turn_count !=st.session_state.turn_count:
            st.session_state.previous_turn_count= st.session_state.turn_count
            st.rerun()

        
        if is_multiple_of_10(st.session_state.counter):
            st.rerun()
    except TypeError:
        st.rerun()
@st.experimental_fragment(run_every=1)
def turn_checkc():
    try:
        st.session_state.counter+=1
        st.session_state.turn_count=get_turn_count(st.session_state.games_id._id)
        st.write(st.session_state.turn_count)
        if st.session_state.previous_turn_count !=st.session_state.turn_count:
            st.session_state.previous_turn_count= st.session_state.turn_count
            st.rerun()

        st.write(st.session_state.counter)
        if is_multiple_of_10(st.session_state.counter):
            st.rerun()

    except TypeError:
        st.rerun()
        

        


@st.experimental_dialog("ROCK PAPER SCISSORS")
def number_of_powerup():
    st.write("Number of power ups you get at your disposal depends on who wins a game of rock paper scissors please pick one and submit")
    st.session_state.rock_paper_scissors=st.selectbox("ROCK PAPER SCISSORS",options=["Rock🪨","Paper📃","Scissors ✂️"],index=None)
    if st.session_state.rock_paper_scissors is not None:
        st.session_state.connection_status=True
        if st.session_state.player_type=='creator':
            add_choices_to_existing_gameplayc(st.session_state.game_play_id,st.session_state.rock_paper_scissors)
        if st.session_state.player_type=='joiner':
            import time
            time.sleep(7)
            add_choices_to_existing_gameplayj(st.session_state.game_play_id,st.session_state.rock_paper_scissors)
        if st.button("Submit"):
            st.rerun()


def check_unique(one,two,thr,four):

    
    # Store the values in a set to check for uniqueness
    values = {one, two, thr, four}
    
    # Check if the number of unique values is equal to the number of inputs
    if len(values) == 4:
        return True
    else: return False
@st.experimental_dialog("Set Your Unique Four Digit Number",width="large")
def set_unique_number():
    one,two,thr,four=st.columns(4)

    with one:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="one")
    with two:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="two")
    with thr:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="thr")
    with four:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="four")

    if check_unique(st.session_state.one,st.session_state.two,st.session_state.thr,st.session_state.four):
        if st.button("Ready!!!😌"):
            st.session_state.user_number=[st.session_state.one,st.session_state.two,st.session_state.thr,st.session_state.four]
            st.rerun()
    else:
        st.info("Make sure all your numbers are different and unique 😁")
        st.button("ready to play")

@st.experimental_dialog("Guess Opponents code",width="large")
def guess():
    one,two,thr,four=st.columns(4)

    with one:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="one")
    with two:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="two")
    with thr:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="thr")
    with four:
        st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="four")

    if check_unique(st.session_state.one,st.session_state.two,st.session_state.thr,st.session_state.four):
        if st.button("Guess!!!😌"):
            st.session_state.guess=[st.session_state.one,st.session_state.two,st.session_state.thr,st.session_state.four]
            st.rerun()
    else:
        st.info("Make sure all your numbers are different and unique 😁")
        

@st.experimental_fragment(run_every=1)
def check_if_player_has_connected():
    if check_creator_choice_exists(gameplay_id=st.session_state.game_play_id._id)==True:
        
        return True
    else: return False
        
def CreateGame():
    st.session_state.game_id=create_game(st.session_state.UD._id)
    if st.session_state.game_id is not None:
        st.session_state.player_type="creator"
        st.session_state.games_id = st.session_state.game_id
if st.session_state.games_id is None or st.session_state.player_type is None:
    st.button("Create Game",on_click=CreateGame)       
        
    with st.popover("Join game"):
        st.write(":violet-background[Paste Game Code From friend here]")
        col1,col2= st.columns(2)
        with col1:
            st.text_input("Enter Code Here",label_visibility="collapsed",key="join_code",disabled=st.session_state.join_ability)
        with col2:
            if st.session_state.join_code is not None:
                if st.button("Join"):
                    if not check_player_created_game(st.session_state.UD._id, st.session_state.join_code) and not check_game_already_joined(st.session_state.join_code):
                        st.session_state.join_ability=True
                        st.session_state.games_id=st.session_state.join_code
                        st.session_state.player_type="joiner"
                        st.session_state.game_play_id=create_gameplay(st.session_state.games_id,st.session_state.UD._id,guess=[""])
                        st.rerun()
                    else:
                        st.toast(" :red-background[⚠️ Player Can't Join with this code]")





        
elif st.session_state.game_id is not None and st.session_state.player_type=="creator" and st.session_state.game_play_id is None and st.session_state.game_started==False:
    st.write("## :blue-background[Share the Code below with another player ]")
    st.code(st.session_state.game_id._id)
    st.write("⌛Waiting for Player to join...")
    
    get_gameplayID()


elif st.session_state.games_id is not None and st.session_state.player_type=="joiner" and st.session_state.game_play_id is None and st.session_state.game_started==False:
    st.write(st.session_state.games_id._id)
    st.warning("Connecting to your game 🎮 wait a sec...")
    if check_if_player_has_connected()==True:
        number_of_powerup()
       

elif st.session_state.games_id is not None and st.session_state.player_type=="joiner" and st.session_state.game_play_id is not None and st.session_state.connection_status==False and st.session_state.game_started==False:
    number_of_powerup()
    if st.session_state.rock_paper_scissors is not None: 
        add_choices_to_existing_gameplayj(st.session_state.game_play_id,st.session_state.rock_paper_scissors)

elif st.session_state.games_id is not None and st.session_state.player_type=="creator" and st.session_state.game_play_id is not None and st.session_state.connection_status==False and st.session_state.game_started==False:
    number_of_powerup()
    if st.session_state.rock_paper_scissors is not None:
        add_choices_to_existing_gameplayc(st.session_state.game_play_id,st.session_state.rock_paper_scissors)
        


elif st.session_state.games_id is not None and st.session_state.player_type=="joiner" and st.session_state.game_play_id is not None and st.session_state.connection_status==True and st.session_state.game_started==False:
    st.success("Connected")
    if st.session_state.user_number=="not set":set_unique_number()
    else:
        st.session_state.opponents_choice = get_gameplay_choices(st.session_state.game_play_id._id)['creator_choice']
        st.session_state.player_fate=rock_paper_scissors(st.session_state.rock_paper_scissors,st.session_state.opponents_choice)
        save_turn_count(ObjectId(st.session_state.games_id),st.session_state.turn_count+1)
        if st.session_state.player_fate=='winner':
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=3)
            st.session_state.game_started=True
            st.rerun()
        elif st.session_state.player_fate=='loser' :
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=1)
            st.session_state.game_started=True
            st.rerun()
        elif st.session_state.player_fate=='draw':
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=2)
            st.session_state.game_started=True
            st.rerun()
    
    
    
    
    
elif st.session_state.games_id is not None and st.session_state.player_type=="creator" and st.session_state.game_play_id is not None and st.session_state.connection_status==True and st.session_state.game_started==False:
    st.success("Connected")
    if st.session_state.user_number=="not set":set_unique_number()
    else:

        st.session_state.opponents_choice = get_gameplay_choices(st.session_state.game_play_id._id)['joiner_choice']
        st.session_state.player_fate=rock_paper_scissors(st.session_state.rock_paper_scissors,st.session_state.opponents_choice)
        if st.session_state.player_fate=='winner':
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=3)
            st.session_state.game_started=True
            st.rerun()
        elif st.session_state.player_fate=='loser' :
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=1)
            st.session_state.game_started=True
            st.rerun()
        elif st.session_state.player_fate=='draw':
            st.session_state.powerup_object=create_powerup(game_play_id=st.session_state.game_play_id._id,player_id=st.session_state.UD._id,number=2)
            st.session_state.game_started=True
            st.rerun()

    

elif st.session_state.games_id is not None and st.session_state.player_type=="joiner" and st.session_state.game_play_id is not None and st.session_state.connection_status==True and st.session_state.game_started==True:
    st.success("started")
    turn_checkj()
    gameUpdates(ObjectId(st.session_state.games_id))

    my_game,opps_game =st.tabs([f"{st.session_state.UD.first_name}",f"Opponent"])
    with my_game:
        for game in st.session_state.game_updates:
            try:
                if game['role']=='joiner':
                    with st.chat_message(name="human"):
                        st.code(game['guess'])
                        st.divider()
                        
                        st.write(f":red-background[Dead:] [{calculate_dead(game['guess'],game['secret number'])}] :violet-background[Injured:] [{calculate_injured(game['guess'],game['secret number'])}]")
            except TypeError:
                pass
        with opps_game:
            for game in st.session_state.game_updates:
                try:
                    if game['role']=='creator':
                        with st.chat_message(name="ai"):
                            st.code(game['guess'])
                            st.divider()
                            st.write(f":red-background[Dead:] [{calculate_dead(game['guess'],game['secret number'])}] :violet-background[Injured:] [{calculate_injured(game['guess'],game['secret number'])}]")
                except TypeError:
                    pass
    
    st.write(st.session_state.games_id)
    if check_even_odd(st.session_state.turn_count)=='even':
        st.success("Its his turn")
        if st.session_state.guess==0:guess()
        if st.button("play"):
            st.session_state.game_updates.append({"role":"joiner","guess":st.session_state.guess,"secret number":st.session_state.user_number})
            update_game_play(ObjectId(st.session_state.games_id),st.session_state.game_updates)
            st.session_state.guess=0
            save_turn_count(ObjectId(st.session_state.games_id),st.session_state.turn_count+1)
    
    
    
elif st.session_state.games_id is not None and st.session_state.player_type=="creator" and st.session_state.game_play_id is not None and st.session_state.connection_status==True and st.session_state.game_started==True:
    st.success("started")
    turn_checkc()

    gameUpdates(st.session_state.games_id._id)
    my_game,opps_game =st.tabs([f"{st.session_state.UD.first_name}",f"Opponent"])
    with my_game:
        for game in st.session_state.game_updates:
            try:
                if game['role']=='creator':
                    with st.chat_message(name="human"):
                        st.code(game['guess'])
                        st.divider()
                        st.write(f":red-background[Dead:] [{calculate_dead(game['guess'],game['secret number'])}] :violet-background[Injured:] [{calculate_injured(game['guess'],game['secret number'])}]")
            except TypeError:
                pass
        with opps_game:
            for game in st.session_state.game_updates:
                try:
                    if game['role']=='joiner':
                        with st.chat_message(name="ai"):
                            st.code(game['guess'])
                            st.divider()
                            st.write(f":red-background[Dead:] [{calculate_dead(game['guess'],game['secret number'])}] :violet-background[Injured:] [{calculate_injured(game['guess'],game['secret number'])}]")
                except TypeError:
                    pass
    
    
    if check_even_odd(st.session_state.turn_count)=='odd':
        st.success("Its his turn")
        if st.session_state.guess==0:guess()
        if st.button("play"):
            st.session_state.game_updates.append({"role":"creator","guess":st.session_state.guess,"secret number":st.session_state.user_number})
            update_game_play(st.session_state.games_id._id,guess=st.session_state.game_updates)
            st.session_state.guess=0
            save_turn_count(st.session_state.games_id._id,st.session_state.turn_count+1)










